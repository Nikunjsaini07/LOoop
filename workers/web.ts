import handler from 'vinext/server/fetch-handler';
import { secureResponse } from '../lib/response-headers';

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return secureResponse(await handler.fetch(request, env, ctx), request.url);
  },
};
export default worker;
