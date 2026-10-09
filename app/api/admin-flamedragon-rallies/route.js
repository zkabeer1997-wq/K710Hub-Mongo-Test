import { makeRallyHandlers } from '../../../lib/rallyRoute.server';

export const { GET, PUT } = makeRallyHandlers({ type: 'flamedragon', collection: 'FLAMEDRAGON_ADMIN_RALLIES', label: 'admin-flamedragon-rallies' });
