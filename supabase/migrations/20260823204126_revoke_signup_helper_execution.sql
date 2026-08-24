/*
# Revoke public signup helper execution

1. Purpose
- Prevents direct API callers from invoking the internal account-creation trigger helper.

2. Security
- Removes EXECUTE permission from the public, anonymous, and signed-in roles.
- The auth trigger can still invoke the function internally when a new account is created.

3. Important note
- No user data is changed. This only closes an unnecessary remote-call surface.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
