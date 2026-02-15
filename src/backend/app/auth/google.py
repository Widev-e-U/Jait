"""
Google OAuth2 authentication
"""
import httpx
from typing import Optional
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
from app.config import get_settings

settings = get_settings()

# OAuth setup
oauth = OAuth()

oauth.register(
    name='google',
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
)


async def verify_google_token(token: str) -> Optional[dict]:
    """
    Verify a Google ID token and return user info.
    Alternative to OAuth flow - useful for frontend that uses @react-oauth/google.
    """
    async with httpx.AsyncClient() as client:
        # Verify token with Google
        response = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        
        # Verify the token is for our app
        if data.get("aud") != settings.google_client_id:
            return None
        
        return {
            "google_id": data.get("sub"),
            "email": data.get("email"),
            "name": data.get("name"),
            "picture": data.get("picture"),
            "email_verified": data.get("email_verified") == "true"
        }


async def get_google_user_info(access_token: str) -> Optional[dict]:
    """
    Get user info from Google using an access token.
    Used after OAuth callback.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        
        return {
            "google_id": data.get("id"),
            "email": data.get("email"),
            "name": data.get("name"),
            "picture": data.get("picture"),
        }
