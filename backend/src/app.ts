import { Hono } from 'hono';
import chores from './routes/chores.js';
import me from './routes/me.js';
import members from './routes/members.js';
import rooms from './routes/rooms.js';
import households from './routes/households.js';
import { accessAuth } from './middleware/access-auth.js';
import { householdScope } from './middleware/household-scope.js';
import { requireAdmin } from './middleware/require-admin.js';
import type { AppEnv } from './types.js';

const app = new Hono<AppEnv>();

app.get('/', (c) => c.text('ok'));

app.use('/api/chores/*', accessAuth, householdScope);
app.route('/api/chores', chores);

app.use('/api/me', accessAuth, householdScope);
app.route('/api/me', me);

app.use('/api/members/*', accessAuth, householdScope, requireAdmin);
app.route('/api/members', members);

app.use('/api/rooms/*', accessAuth, householdScope);
app.route('/api/rooms', rooms);

app.use('/api/households/*', accessAuth, householdScope, requireAdmin);
app.route('/api/households', households);

export default app;
