export const tokenPayload = (overrides = {}) => ({
  userId: "u1", email: "a@a.com", rol: "GUIA", sid: "s1", aud: "web",
  iat: Math.floor(Date.now()/1000),
  ...overrides
});
