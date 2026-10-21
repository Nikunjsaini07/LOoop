import { createClerkClient } from '@clerk/backend';
import { env } from 'cloudflare:workers';

export class AuthenticationError extends Error {}

function clerkSettings() {
  const secretKey = env.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const jwtKey = env.CLERK_JWT_KEY || process.env.CLERK_JWT_KEY;
  const parties = env.CLERK_AUTHORIZED_PARTIES || process.env.CLERK_AUTHORIZED_PARTIES;
  if (!secretKey || !publishableKey || !parties) throw new Error('Clerk server configuration is incomplete');
  const authorizedParties = parties.split(',').map(value => new URL(value.trim()).origin);
  return { secretKey, publishableKey, jwtKey, authorizedParties };
}

export async function getCurrentUser(request: Request, details = false) {
  // The React client obtains a fresh Clerk session token for every API request.
  // Cookie/header identities from the old hosting provider are never accepted.
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  if (!/^Bearer \S+$/i.test(authorization)) throw new AuthenticationError('Invalid session');
  const settings = clerkSettings();
  const clerk = createClerkClient(settings);
  const verified = await clerk.authenticateRequest(new Request(request.url, {
    headers: { authorization },
  }), { authorizedParties: settings.authorizedParties, acceptsToken: 'session_token' });
  const identity = verified.toAuth();
  if (!verified.isAuthenticated || !identity?.userId) throw new AuthenticationError('Your session expired. Sign in again.');
  const account = details ? await clerk.users.getUser(identity.userId) : null;
  const email = account?.emailAddresses.find(value => value.id === account.primaryEmailAddressId)?.emailAddress ?? '';
  const fullName = account ? [account.firstName, account.lastName].filter(Boolean).join(' ') || null : null;
  return { userId: identity.userId, email, fullName, displayName: fullName || email || 'Reader' };
}

export async function deleteIdentity(verifiedUserId: string) {
  await createClerkClient(clerkSettings()).users.deleteUser(verifiedUserId);
}
