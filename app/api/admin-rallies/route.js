import { makeRallyHandlers } from '../../../lib/rallyRoute.server';

export const { GET, PUT } = makeRallyHandlers({ type: 'kvk', collection: 'ADMIN_RALLIES', label: 'admin-rallies' });
