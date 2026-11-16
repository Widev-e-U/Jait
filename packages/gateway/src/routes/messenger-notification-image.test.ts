import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { signAuthToken } from '../security/http-auth.js';
import { MessengerService } from '../services/messenger-service.js';
import { registerMessengerRoutes } from './messenger.js';

describe('messenger notification image route', () => {
  it('requires authentication and resolves only the requested owner and message', async () => {
    const restore = vi.spyOn(MessengerService.prototype, 'restore').mockImplementation(() => {});
    const image = vi.spyOn(MessengerService.prototype, 'notificationImage').mockResolvedValue(Buffer.from('jpeg'));
    const config = { ...loadConfig(), jwtSecret: 'notification-image-test' };
    const app = Fastify();
    try {
      registerMessengerRoutes(app, config);
      const payload = { roomId: '!room:test', eventId: '$photo' };
      expect((await app.inject({ method: 'POST', url: '/api/messenger/notification-image', payload })).statusCode).toBe(401);
      expect(image).not.toHaveBeenCalled();
      const token = await signAuthToken({ id: 'owner', username: 'owner' }, config.jwtSecret);
      const headers = { authorization: `Bearer ${token}` };
      expect((await app.inject({ method: 'POST', url: '/api/messenger/notification-image', headers, payload: { ...payload, url: 'https://evil.test' } })).statusCode).toBe(400);
      const response = await app.inject({ method: 'POST', url: '/api/messenger/notification-image', headers, payload });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/jpeg');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(image).toHaveBeenCalledWith('owner', '!room:test', '$photo');
    } finally {
      await app.close();
      restore.mockRestore();
      image.mockRestore();
    }
  });
});
