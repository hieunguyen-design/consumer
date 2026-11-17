/**
 * Attempts official Graph endpoints.
 * Facebook removed/never shipped write endpoints for unfriend and page-unfollow,
 * so this currently only handles future-proofing + explicit "not supported" signals.
 */
export async function graphAdapter({ target, fb, graphVersion }) {
  if (target.action === 'unfollow_page') {
    // Documented only for Pages acting on their own objects; will 403 for user->page unfollow.
    const r = await fetch(
      `https://graph.facebook.com/${graphVersion}/${target.fbId}/likes?access_token=${fb.token}`,
      { method: 'DELETE' },
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success)
      return {
        id: target.id,
        status: 'success',
        message: 'Unfollowed via Graph API',
      };
    return null; // fall through to next adapter
  }
  return null; // unfriend has no endpoint — never has
}
