import importlib.util
import json
import io
import os
import sqlite3
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('adapter', os.path.join(os.path.dirname(__file__), 'tenant-adapter.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
a.DB = ':memory:'
a.MXID = '@test:example.test'

class TenantApplyTest(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(':memory:')
        self.conn.execute('create table user_login (bridge_id text, user_mxid text, id text, remote_name text, metadata text)')
        self.account = '8:orgid:11111111-1111-1111-1111-111111111111'
        self.tenant = '22222222-2222-2222-2222-222222222222'
        self.oid = '33333333-3333-3333-3333-333333333333'
        self.conn.execute('insert into user_login values (?, ?, ?, ?, ?)', ('bridge', a.MXID, self.account, 'parent', json.dumps({'refresh_token':'parent'})))
        self.payload = {'accountId': self.account, 'tenantId': self.tenant, 'token': 'x' * 120}

    def test_guest_home_is_the_issuer_tenant_only_for_guest_logins(self):
        home = '55555555-5555-5555-5555-555555555555'
        with patch.object(a, 'claims', return_value={'idp': 'https://sts.windows.net/' + home + '/'}):
            self.assertEqual(a.guest_home({'tenant_id': self.tenant, 'auth_token': 'x'}), home)
            self.assertEqual(a.guest_home({'tenant_id': home, 'auth_token': 'x'}), '')
        with patch.object(a, 'claims', side_effect=ValueError):
            self.assertEqual(a.guest_home({'tenant_id': self.tenant}), '')

    def test_sign_in_address_prefers_a_home_account_email(self):
        with patch.object(a, 'claims', return_value={
            'preferred_username': 'guest_example.com#EXT#@tenant.onmicrosoft.com',
            'upn': 'guest@example.com',
        }):
            self.assertEqual(a.account_sign_in_address({'auth_token': 'x'}), 'guest@example.com')
        self.assertIsNone(a.account_sign_in_address({'auth_token': 'unreadable'}))

    def test_rejected_refresh_token_is_reported_as_expired(self):
        error = a.urllib.error.HTTPError('https://login.test', 400, 'invalid_grant', {}, None)
        with patch.object(a, 'exchange', side_effect=error):
            with self.assertRaises(a.AuthExpired):
                a.tenants({'refresh_token': 'dead', 'tenant_id': 'common'})
        error = a.urllib.error.HTTPError('https://login.test', 503, 'unavailable', {}, None)
        with patch.object(a, 'exchange', side_effect=error):
            with self.assertRaises(a.urllib.error.HTTPError):
                a.tenants({'refresh_token': 'ok', 'tenant_id': 'common'})

    def test_tenant_checks_its_own_refresh_token(self):
        entry = {'id': self.tenant, 'oid': self.oid, 'name': 'Example'}
        login = '8:orgid:' + self.oid
        existing = {(self.tenant, login)}
        metadata = {login: {'refresh_token': 'guest'}}
        with patch.object(a, 'exchange', return_value={'access_token': 'valid'}) as exchange:
            self.assertEqual(a.tenant_status(entry, existing, metadata)['state'], 'connected')
            exchange.assert_called_once_with('guest', self.tenant)
        rejected = a.urllib.error.HTTPError('https://login.test', 400, 'error', {}, io.BytesIO(b'{"error":"invalid_grant"}'))
        with patch.object(a, 'exchange', side_effect=rejected):
            actual = a.tenant_status(entry, existing, metadata)
            self.assertEqual(actual['state'], 'expired')
            self.assertFalse(actual['connected'])
        unavailable = a.urllib.error.HTTPError('https://login.test', 503, 'error', {}, io.BytesIO(b'{}'))
        with patch.object(a, 'exchange', side_effect=unavailable):
            self.assertEqual(a.tenant_status(entry, existing, metadata)['state'], 'unknown')
        self.assertEqual(a.tenant_status(entry, existing, {})['state'], 'expired')
        self.assertEqual(a.tenant_status(entry, set(), {})['state'], 'disconnected')

    def test_wrong_account_never_writes(self):
        with patch.object(a.sqlite3, 'connect', return_value=self.conn), patch.object(a, 'tenants', return_value=[{'id': self.tenant, 'oid': self.oid}]), patch.object(a, 'exchange', return_value={'id_token': 'id'}), patch.object(a, 'claims', return_value={'tid': self.tenant, 'oid': '44444444-4444-4444-4444-444444444444'}):
            with self.assertRaisesRegex(ValueError, 'does not match'):
                a.apply(self.payload)
            self.assertEqual(self.conn.execute('select count(*) from user_login').fetchone()[0], 1)

    def test_verified_identity_creates_tenant_login(self):
        class Connection:
            def __init__(self, conn): self.conn = conn
            def execute(self, *args): return self.conn.execute(*args)
            def __enter__(self): self.conn.__enter__(); return self
            def __exit__(self, *args): return self.conn.__exit__(*args)
            def close(self): pass
        selected = {'id': self.tenant, 'oid': self.oid, 'name': 'Example'}
        token = {'id_token': 'id', 'access_token': 'access', 'refresh_token': 'refresh'}
        with patch.object(a.sqlite3, 'connect', return_value=Connection(self.conn)), patch.object(a, 'tenants', return_value=[selected]), patch.object(a, 'exchange', return_value=token), patch.object(a, 'claims', return_value={'tid': self.tenant, 'oid': self.oid, 'name': 'User'}), patch.object(a, 'request', return_value={'tokens': {'skypeToken': 'skype'}}), patch.object(a.subprocess, 'run') as restart, patch('builtins.print'):
            a.apply(self.payload)
            row = self.conn.execute('select metadata from user_login where id = ?', ('8:orgid:' + self.oid,)).fetchone()
            self.assertEqual(json.loads(row[0])['tenant_id'], self.tenant)
            restart.assert_called_once()

    def test_missing_membership_never_exchanges_login(self):
        with patch.object(a.sqlite3, 'connect', return_value=self.conn), patch.object(a, 'tenants', return_value=[]), patch.object(a, 'exchange') as exchange:
            with self.assertRaisesRegex(ValueError, 'not available'):
                a.apply(self.payload)
            exchange.assert_not_called()
            self.assertEqual(self.conn.execute('select count(*) from user_login').fetchone()[0], 1)

if __name__ == '__main__': unittest.main()
