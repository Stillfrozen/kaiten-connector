// Barrel for the OAuth module. Keeps `import * as oauth from "./oauth.js"`
// (and the dynamic import in tests/oauth.test.ts) working while the
// implementation lives in small, focused files under src/oauth/.
export { ALLOW_UNAUTHENTICATED } from "./oauth/config.js";
export { timingSafeEqualStr, verifyPkce } from "./oauth/crypto.js";
export { createCsrfToken, verifyCsrfToken } from "./oauth/csrf.js";
export {
  protectedResourceMetadata,
  authServerMetadata,
  registerClient,
} from "./oauth/routes-metadata.js";
export { authorize, authorizeApprove } from "./oauth/routes-authorize.js";
export { token } from "./oauth/routes-token.js";
export { requireBearerAuth } from "./oauth/middleware.js";
export { __testing__ } from "./oauth/store.js";
