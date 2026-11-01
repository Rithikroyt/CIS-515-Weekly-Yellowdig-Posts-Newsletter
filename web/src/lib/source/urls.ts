// The one place a public Yellowdig link may be built. Downstream code and AI never construct links.
//
// VERIFIED (2026-11-01): the instructor's published Week 2 issue links every post as
// https://yellowdig.app/n/<network>/community/<communityId>?postId=<postId>, using this course's network and
// community id and the same post ids the Yellowdig API returns. Links are built only from those identifiers.
export const POST_URL_FORMAT_VERIFIED = true;

export function yellowdigPostUrl(network: string, communityId: string, postId: string): string | null {
  if (!POST_URL_FORMAT_VERIFIED) return null;
  return "https://yellowdig.app/n/" + encodeURIComponent(network) + "/community/" + encodeURIComponent(communityId) + "?postId=" + encodeURIComponent(postId);
}
