#!/usr/bin/env python3
"""Tenant discovery and verified token import for a local mautrix-teams bridge.

Input to apply is JSON on stdin. No credentials or Microsoft response bodies are logged.
Set JAIT_TEAMS_DB and JAIT_TEAMS_MXID for another installation.
"""
import base64
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid

DB = os.environ.get('JAIT_TEAMS_DB', '')
MXID = os.environ.get('JAIT_TEAMS_MXID', '')
DIR = os.path.dirname(os.path.abspath(__file__))
CID = '5e3ce6c0-2b1f-4285-8d4b-75ee78787346'
SCOPE = 'https://api.spaces.skype.com/.default openid profile offline_access'
UUID = re.compile(r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'


def request(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=6) as res:
        return json.loads(res.read(2_000_000))


def exchange(token, tenant):
    if tenant != 'common' and not UUID.fullmatch(tenant):
        raise ValueError('Invalid tenant ID')
    data = urllib.parse.urlencode({'grant_type': 'refresh_token', 'client_id': CID,
        'refresh_token': token, 'scope': SCOPE}).encode()
    return request('https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token', data,
        {'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://teams.microsoft.com',
         'Referer': 'https://teams.microsoft.com/'})


def claims(token):
    part = token.split('.')[1]
    return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))


def tenants(meta):
    tenant = str(meta.get('tenant_id', '')).lower()
    token = exchange(meta['refresh_token'], tenant)['access_token']
    found = request('https://teams.microsoft.com/api/mt/part/emea-03/beta/users/tenants', headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
    if not isinstance(found, list):
        raise ValueError('Invalid tenant response')
    result = []
    for entry in found[:200]:
        tid, oid, name = str(entry.get('tenantId', '')).lower(), str(entry.get('userId', '')).lower(), entry.get('tenantName')
        if UUID.fullmatch(tid) and UUID.fullmatch(oid) and isinstance(name, str) and name.strip():
            result.append({'id': tid, 'oid': oid, 'name': name.strip()[:200]})
    return result


def require_configuration():
    if not DB or not MXID:
        raise ValueError('Bridge database and Matrix user must be configured')


def status():
    require_configuration()
    base = subprocess.run(['python3', os.path.join(DIR, 'teams-status-base.py')], capture_output=True, text=True, timeout=12, check=True)
    result = json.loads(base.stdout)
    with sqlite3.connect('file:' + DB + '?mode=ro', uri=True) as conn:
        rows = conn.execute('SELECT id, metadata FROM user_login WHERE user_mxid = ?', (MXID,)).fetchall()
    metadata = {row[0]: json.loads(row[1] or '{}') for row in rows}
    existing = {(str(m.get('tenant_id', '')).lower(), str(m.get('user_mri', '')).lower()) for m in metadata.values()}
    for account in result.get('accounts', []):
        try:
            entries = tenants(metadata[account['id']])
            account['tenants'] = [{'id': e['id'], 'name': e['name'],
                'connected': (e['id'], '8:orgid:' + e['oid']) in existing} for e in entries]
        except Exception:
            account['tenantError'] = 'Could not load organizations. Refresh or sign in again.'
    print(json.dumps(result))


def apply(payload):
    require_configuration()
    account, tenant, token = payload.get('accountId'), str(payload.get('tenantId', '')).lower(), payload.get('token')
    if not isinstance(account, str) or not re.fullmatch(r'8:orgid:[0-9a-fA-F-]{36}', account) or not UUID.fullmatch(tenant) or not isinstance(token, str) or len(token) < 100:
        raise ValueError('Invalid tenant login request')
    conn = sqlite3.connect(DB, timeout=10)
    row = conn.execute('SELECT bridge_id, metadata FROM user_login WHERE user_mxid = ? AND id = ?', (MXID, account)).fetchone()
    if not row:
        raise ValueError('Parent account no longer exists')
    matches = [e for e in tenants(json.loads(row[1])) if e['id'] == tenant]
    if len(matches) != 1:
        raise ValueError('Organization is not available to this account')
    tok = exchange(token, tenant)
    identity = claims(tok.get('id_token', ''))
    oid = str(identity.get('oid', '')).lower()
    if str(identity.get('tid', '')).lower() != tenant or oid != matches[0]['oid']:
        raise ValueError('The signed-in account does not match the selected organization')
    at, rt = tok.get('access_token'), tok.get('refresh_token')
    if not at or not rt:
        raise ValueError('Microsoft did not return the required tokens')
    authz = request('https://teams.microsoft.com/api/authsvc/v1.0/authz', b'{}',
        {'Authorization': 'Bearer ' + at, 'Accept': 'application/json; ver=1.0', 'Content-Type': 'application/json'})
    skype = (authz.get('tokens') or {}).get('skypeToken') or (authz.get('skypeToken') or {}).get('skypetoken')
    if not skype:
        raise ValueError('Teams did not return a bridge token')
    mri = '8:orgid:' + oid
    old = conn.execute('SELECT metadata FROM user_login WHERE bridge_id = ? AND user_mxid = ? AND id = ?', (row[0], MXID, mri)).fetchone()
    meta = json.loads(old[0]) if old else {'trouter_endpoint_id': str(uuid.uuid4())}
    if old and str(meta.get('tenant_id', '')).lower() != tenant:
        raise ValueError('Existing login belongs to another organization')
    meta.update(auth_token=at, refresh_token=rt, skype_token=skype, tenant_id=tenant, user_mri=mri,
                display_name=identity.get('name') or matches[0]['name'], tenant_name=matches[0]['name'])
    chat = (authz.get('regionGtms') or {}).get('chatServiceAfd')
    if chat: meta['chat_svc_base'] = chat
    with conn:
        if old:
            conn.execute('UPDATE user_login SET metadata = ? WHERE bridge_id = ? AND user_mxid = ? AND id = ?', (json.dumps(meta), row[0], MXID, mri))
        else:
            conn.execute('INSERT INTO user_login (bridge_id, user_mxid, id, remote_name, metadata) VALUES (?, ?, ?, ?, ?)',
                (row[0], MXID, mri, meta['display_name'], json.dumps(meta)))
    conn.close()
    try:
        subprocess.run(['docker', 'restart', 'matrix_teams'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30, check=True)
    except Exception as exc:
        raise ValueError('Credentials saved, but bridge restart failed') from exc
    print(json.dumps({'state': 'connected'}))


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['status']: status()
        elif sys.argv[1:] == ['apply']: apply(json.loads(sys.stdin.read(16384)))
        else: raise ValueError('Invalid command')
    except Exception as exc:
        print('Tenant bridge: ' + (str(exc) if isinstance(exc, (ValueError, KeyError)) else 'request failed'), file=sys.stderr)
        sys.exit(1)
