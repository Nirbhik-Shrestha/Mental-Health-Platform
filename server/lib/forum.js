const idOf = (ref) => (ref?._id ?? ref)?.toString();

const authorOf = (ref, anonymous) =>
  anonymous ? null : { _id: idOf(ref), username: ref?.username ?? "[deleted]" };

/**
 * Shape a post for a viewer. Anonymous authors are never sent to the client
 * (not even their id); `isMine` lets the author still manage their own post.
 * Expects `author` and `comments.user` populated with username.
 */
export function serializePost(post, viewer) {
  const viewerId = viewer._id.toString();
  return {
    _id: post._id,
    content: post.content,
    createdAt: post.createdAt,
    anonymous: post.anonymous,
    author: authorOf(post.author, post.anonymous),
    isMine: idOf(post.author) === viewerId,
    likeCount: post.likes.length,
    likedByMe: post.likes.some((id) => id.toString() === viewerId),
    reportedByMe: post.reports.some((report) => idOf(report.user) === viewerId),
    comments: post.comments.map((comment) => ({
      _id: comment._id,
      text: comment.text,
      createdAt: comment.createdAt,
      anonymous: comment.anonymous,
      author: authorOf(comment.user, comment.anonymous),
      isMine: idOf(comment.user) === viewerId,
    })),
  };
}

export const POPULATE_POST = [
  { path: "author", select: "username" },
  { path: "comments.user", select: "username" },
];
