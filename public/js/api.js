/** Thin fetch wrapper. Every network error surfaces as an ApiError. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network', fields = null } = {}) {
    super(message);
    this.status = status; this.code = code; this.fields = fields;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", { code: 'offline' });
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    throw new ApiError(
      data.message || fallbackMessage(res.status),
      { status: res.status, code: data.error || 'http_error', fields: data.fields || null },
    );
  }
  return data;
}

const fallbackMessage = (status) =>
  status === 429 ? 'Too many attempts. Give it a moment.'
  : status === 401 ? 'You need to sign in.'
  : status >= 500 ? 'Something went wrong on our end.'
  : 'That request failed.';

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  del: (p) => request('DELETE', p),

  me: () => api.get('/api/auth/me'),
  signup: (payload) => api.post('/api/auth/signup', payload),
  login: (payload) => api.post('/api/auth/login', payload),
  logout: () => api.post('/api/auth/logout'),

  picker: () => api.get('/api/games/picker'),
  preview: (gameIds, limit = 3) => api.post('/api/preview', { gameIds, limit }),
  seed: (gameIds) => api.post('/api/seed', { gameIds }),
  setLibrary: (gameIds) => request('PUT', '/api/library', { gameIds }),
  recommendations: (limit = 12) => api.get(`/api/recommendations?limit=${limit}`),
  profile: () => api.get('/api/profile'),
  feedback: (gameId, signal) => api.post('/api/feedback', { gameId, signal }),
  clearFeedback: (gameId) => api.del(`/api/feedback/${encodeURIComponent(gameId)}`),

  game: (id) => api.get(`/api/games/${encodeURIComponent(id)}`),
  similar: (id, limit = 6) => api.get(`/api/games/${encodeURIComponent(id)}/similar?limit=${limit}`),
  reviewHighlights: (limit = 6) => api.get(`/api/reviews/highlights?limit=${limit}`),
  reviews: (id, sort) => api.get(`/api/games/${encodeURIComponent(id)}/reviews`
    + (sort ? `?sort=${encodeURIComponent(sort)}` : '')),
  postReview: (id, payload) => api.post(`/api/games/${encodeURIComponent(id)}/reviews`, payload),
  deleteReview: (id) => api.del(`/api/games/${encodeURIComponent(id)}/reviews`),
  voteReview: (reviewId, helpful) => api.post(`/api/reviews/${encodeURIComponent(reviewId)}/vote`, { helpful }),
  reportReview: (reviewId, reason) => api.post(`/api/reviews/${encodeURIComponent(reviewId)}/report`, { reason }),

  hubs: () => api.get('/api/hubs'),
  hub: (slug, sort) => api.get(`/api/hubs/${encodeURIComponent(slug)}`
    + (sort ? `?sort=${encodeURIComponent(sort)}` : '')),
  joinHub: (slug, leave = false) => api.post(`/api/hubs/${encodeURIComponent(slug)}/join`, { leave }),
  createPost: (slug, payload) => api.post(`/api/hubs/${encodeURIComponent(slug)}/posts`, payload),
  deletePost: (id) => api.del(`/api/posts/${encodeURIComponent(id)}`),
  votePost: (id, up) => api.post(`/api/posts/${encodeURIComponent(id)}/vote`, { up }),
  comments: (postId) => api.get(`/api/posts/${encodeURIComponent(postId)}/comments`),
  addComment: (postId, body) => api.post(`/api/posts/${encodeURIComponent(postId)}/comments`, { body }),
  deleteComment: (id) => api.del(`/api/comments/${encodeURIComponent(id)}`),
};
