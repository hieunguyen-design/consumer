/** Always-available fallback: deterministic deep link the user confirms in one tap. */
export async function assistedAdapter({ target }) {
  const link =
    target.action === 'unfriend'
      ? `https://www.facebook.com/${target.fbId}` // Friends ▾ → Unfriend
      : `https://www.facebook.com/${target.fbId}`; // Following ▾ → Unfollow
  return {
    id: target.id,
    status: 'manual',
    message: 'Graph API has no write endpoint for this action',
    link,
  };
}
