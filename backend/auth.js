const { randomBytes, timingSafeEqual } = require("node:crypto");

function createSessionManager(duration) {
  const sessions = new Map();

  function get(request) {
    const cookie = request.headers.cookie || "";
    const match = cookie.match(/(?:^|;\s*)clinic_session=([a-f0-9]+)/);
    if (!match) return null;
    const expiresAt = sessions.get(match[1]);
    if (!expiresAt || expiresAt < Date.now()) {
      sessions.delete(match[1]);
      return null;
    }
    return match[1];
  }

  return {
    create() {
      const token = randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + duration);
      return token;
    },
    get,
    revoke(request) {
      const token = get(request);
      if (token) sessions.delete(token);
    }
  };
}

function passwordMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

module.exports = { createSessionManager, passwordMatches };
