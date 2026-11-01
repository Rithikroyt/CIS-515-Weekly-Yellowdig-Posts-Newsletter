// The one place a public Yellowdig link may be built. Downstream code and AI never construct links.
//
// NOT VERIFIED: the public URL format for a post has not been confirmed against a real, authorized
// response. Until it is, this returns null and posts carry sourceUrlVerified: false with the
// post and community identifiers instead. Set POST_URL_FORMAT_VERIFIED only after checking a real link.
export const POST_URL_FORMAT_VERIFIED = false;

export function yellowdigPostUrl(network: string, communityId: string, postId: string): string | null {
  if (!POST_URL_FORMAT_VERIFIED) return null;
  return "https://yellowdig.app/n/" + encodeURIComponent(network) + "/community/" + encodeURIComponent(communityId) + "/post/" + encodeURIComponent(postId);
}
