const SESSION_KEY = 'smartdesk-session';
const STORE_KEY = 'smartdesk-data-v1';

const demoUsers = [
  { id: 'admin-001', name: 'Yogeshwari D', email: 'admin@smartdesk.ai', password: 'SmartDesk123!', department: 'Operations', role: 'admin' },
  { id: 'user-001', name: 'Priya Sharma', email: 'priya@smartdesk.ai', password: 'SmartDesk123!', department: 'Operations', role: 'user' },
];

const initialStore = {
  tickets: [
    {
      id: 'TKT-1048',
      title: 'Unable to connect to office Wi-Fi',
      summary: 'Priya cannot connect her laptop to the Office-Secure network.',
      description: 'I cannot connect my laptop to office Wi-Fi.',
      category: 'Network',
      priority: 'High',
      team: 'IT Infrastructure',
      status: 'In Progress',
      requester: 'Priya Sharma',
      requesterId: 'user-001',
      department: 'Operations',
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:17:00.000Z',
      comments: 0,
      suggestedSolution: 'Check network and account settings.',
      resolution: null,
    },
  ],
};

function readStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY));
    if (stored?.tickets) return stored;
  } catch {
    // Re-create invalid browser data from the demo seed.
  }
  const store = structuredClone(initialStore);
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  return store;
}

function writeStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function publicUser({ password, ...user }) {
  return user;
}

function currentUser() {
  const session = getSession();
  return session && demoUsers.find(user => user.id === session.user?.id);
}

function requireUser() {
  const user = currentUser();
  if (!user) throw new Error('Your session is invalid or expired.');
  return user;
}

function parseBody(options) {
  if (!options.body) return {};
  try { return JSON.parse(options.body); } catch { return {}; }
}

function enrichTicket(description = '') {
  const categories = [
    ['Network', /wifi|wi-fi|vpn|internet|network|connect/i],
    ['Hardware', /laptop|screen|keyboard|mouse|device|monitor/i],
    ['HR', /leave|payroll|salary|employee|address|hr /i],
    ['Access', /access|permission|login|password|account/i],
  ];
  const category = categories.find(([, pattern]) => pattern.test(description))?.[0] || 'Software';
  const priority = /critical|outage|everyone|production/i.test(description) ? 'Critical'
    : /urgent|blocked|unable|cannot|can.t/i.test(description) ? 'High'
    : /request|when possible/i.test(description) ? 'Low' : 'Medium';
  const team = category === 'HR' ? 'People Operations'
    : category === 'Network' ? 'IT Infrastructure'
    : category === 'Software' ? 'Business Systems' : 'IT Support';
  const clean = description.replace(/\s+/g, ' ').trim();
  return {
    title: clean ? clean.charAt(0).toUpperCase() + clean.slice(1, 72).replace(/[.!?]+$/, '') : 'New support request',
    summary: clean || 'No description provided.',
    category,
    priority,
    team,
    suggestedSolution: `Review the ${category.toLowerCase()} troubleshooting guide and verify the requester’s device and account configuration.`,
  };
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function api(path, options = {}) {
  const method = options.method || 'GET';
  const body = parseBody(options);

  if (path === '/auth/login' && method === 'POST') {
    const user = demoUsers.find(item => item.email.toLowerCase() === body.email?.toLowerCase() && item.password === body.password);
    if (!user) throw new Error('Invalid email or password.');
    return { token: `local-${user.id}`, user: publicUser(user) };
  }

  const user = requireUser();
  const store = readStore();
  const visibleTickets = () => user.role === 'admin'
    ? store.tickets
    : store.tickets.filter(ticket => ticket.requesterId === user.id);

  if (path === '/dashboard' && method === 'GET') {
    const tickets = visibleTickets();
    const open = tickets.filter(ticket => !['Resolved', 'Closed'].includes(ticket.status));
    return {
      openTickets: open.length,
      highPriority: open.filter(ticket => ['High', 'Critical'].includes(ticket.priority)).length,
      resolvedToday: tickets.filter(ticket => ticket.status === 'Resolved').length,
      recentTickets: tickets.slice(0, 5),
    };
  }

  if (path === '/tickets' && method === 'GET') {
    const tickets = visibleTickets();
    return { tickets, total: tickets.length };
  }

  if (path === '/ai/enrich-ticket' && method === 'POST') {
    if (!body.description?.trim()) throw new Error('Issue description is required.');
    return enrichTicket(body.description);
  }

  if (path === '/tickets' && method === 'POST') {
    if (!body.description?.trim()) throw new Error('Issue description is required.');
    const ai = enrichTicket(body.description);
    const highestId = store.tickets.reduce((highest, ticket) => Math.max(highest, Number(ticket.id.replace('TKT-', '')) || 1000), 1000);
    const now = new Date().toISOString();
    const ticket = {
      id: `TKT-${highestId + 1}`,
      ...ai,
      ...body,
      status: 'Open',
      requester: user.name,
      requesterId: user.id,
      department: body.department || user.department,
      createdAt: now,
      updatedAt: now,
      comments: 0,
      resolution: null,
    };
    store.tickets.unshift(ticket);
    writeStore(store);
    return { ticket };
  }

  const ticketMatch = path.match(/^\/tickets\/(TKT-\d+)$/);
  if (ticketMatch && method === 'PATCH') {
    if (user.role !== 'admin') throw new Error('Administrator access is required.');
    const ticket = store.tickets.find(item => item.id === ticketMatch[1]);
    if (!ticket) throw new Error('Ticket not found.');
    Object.assign(ticket, body, { updatedAt: new Date().toISOString() });
    if (body.status === 'Resolved') {
      ticket.resolution = body.resolution || `The ${ticket.category.toLowerCase()} issue was addressed by ${ticket.team}.`;
    }
    writeStore(store);
    return { ticket };
  }

  throw new Error(`Unsupported local request: ${method} ${path}`);
}
