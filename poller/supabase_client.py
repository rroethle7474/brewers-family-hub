"""
supabase_client.py — module-level Supabase service-role client singleton.

Uses the service-role key so the poller can write to live_game_state and
big_moments without being blocked by RLS policies (those tables have no
INSERT/UPDATE policy — service-role bypasses RLS by design).

SECURITY: This module must never be imported by anything that runs in the
browser. The service-role key must never leave the poller process.
"""

from supabase import create_client, Client
from config import settings

# Module-level singleton. Instantiated once at import time.
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)
