import { Hono } from 'hono';
import chores from './routes/chores.js';
import me from './routes/me.js';
import users from './routes/users.js';
import rooms from './routes/rooms.js';
import { accessAuth } from './middleware/access-auth.js';
import { orgScope } from './middleware/org-scope.js';
import { requireAdmin } from './middleware/require-admin.js';
import type { AppEnv } from './types.js';

const app = new Hono<AppEnv>();

app.get('/', (c) => c.text('ok'));

app.use('/api/chores/*', accessAuth, orgScope);
app.route('/api/chores', chores);

app.use('/api/me', accessAuth, orgScope);
app.route('/api/me', me);

app.use('/api/users/*', accessAuth, orgScope, requireAdmin);
app.route('/api/users', users);

app.use('/api/rooms/*', accessAuth, orgScope);
app.route('/api/rooms', rooms);

export default app;
