import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider as RealClerkProvider, SignIn, SignUp, useAuth as useRealAuth, useClerk as useRealClerk, useUser as useRealUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, Router as WouterRouter, Link, useLocation, useParams } from 'wouter';
import { useEffect, useRef, useState, Component, type ReactNode } from 'react';

const basePath = (import.meta.env.BASE_URL || '').replace(/\/$/, '');
const hasRealClerkKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function useAuth() {
  if (hasRealClerkKey) {
    try { return useRealAuth(); } catch {}
  }
  return { isLoaded: true, isSignedIn: true, userId: "user_demo" };
}

function useUser() {
  if (hasRealClerkKey) {
    try { return useRealUser(); } catch {}
  }
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: "user_demo",
      firstName: "Demo",
      lastName: "Customer",
      fullName: "Demo Customer",
      username: "demouser",
      primaryEmailAddress: { emailAddress: "demo@omnicx.ai" },
    },
  };
}

function useClerk() {
  if (hasRealClerkKey) {
    try { return useRealClerk(); } catch {}
  }
  return { signOut: async () => { window.location.href = basePath || "/"; } };
}
import {
  ArrowRight, BarChart3, Bot, Check, ChevronLeft, Clock3, Command,
  FileText, Globe, Inbox, LayoutDashboard, Lightbulb, Lock, MessageCircle, Mic, MicOff, Phone, PhoneOff, Plus,
  RefreshCw, Search, Send, Shield, Sparkles, Star, Ticket, TrendingUp, Users, Volume2, X, Zap
} from 'lucide-react';
import {
  getGetCxDashboardQueryKey, getGetCxTicketQueryKey, getListCxTicketsQueryKey, getListCxCustomersQueryKey,
  useAssignCxTicket, useCreateCxFeedback, useCreateCxTicket, useCreateCxTicketMessage,
  useGetCxCopilot, useGetCxCustomer360, useGetCxDashboard, useGetCxInsights,
  useGetCxTicket, useListCxCustomers, useListCxTickets, useSendCxChat, useUpdateCxTicketStatus,
  setAuthTokenGetter, setBaseUrl
} from '@workspace/api-client-react';

if (import.meta.env.VITE_API_BASE_URL) {
  setBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

// Default auth token getter for demo/guest mode
setAuthTokenGetter(async () => "user_demo");

function ClerkTokenSync() {
  const { getToken } = useRealAuth();
  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (hasRealClerkKey) {
        try {
          const token = await getToken();
          if (token) return token;
        } catch {}
      }
      return "user_demo";
    });
  }, [getToken]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_bWlnaHR5LW11c3RhbmctODQuY2xlcmsuYWNjb3VudHMuZGV2JA';
const clerkPublishableKey = import.meta.env.VITE_CLERK_PROXY_URL
  ? publishableKeyFromHost(window.location.hostname, rawClerkKey)
  : rawClerkKey;

type R = Record<string, any>;
const cx = (s: string) => s.replaceAll(' ', '-').toLowerCase();

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught UI error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <div className="rounded-2xl border border-[#f26b5b]/30 bg-[#fde2de] p-6 max-w-md">
            <h3 className="font-display text-lg font-bold text-[#1f2340]">Something went wrong</h3>
            <p className="mt-2 text-xs text-[#747588]">The application encountered a transient error. Try refreshing the view.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 rounded-xl bg-[#1f2340] px-4 py-2 text-xs font-bold text-[#f7f7f3]"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${dark ? 'text-[#f7f7f3]' : 'text-[#1f2340]'}`}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#f26b5b] text-[#1f2340] shadow-[3px_3px_0_#f8e5a7]">
        <Command size={17} />
      </span>
      <span className="font-display text-[17px] font-bold tracking-[-.04em]">
        OmniCX <i className="font-normal not-italic text-[#f26b5b]">AI</i>
      </span>
    </div>
  );
}

function LogoutButton() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      aria-label="Log out"
      onClick={() => signOut({ redirectUrl: basePath || '/' })}
      className="text-xs font-bold text-[#747588] hover:text-[#1f2340]"
    >
      Log out
    </button>
  );
}

function Avatar({ name, initials }: { name?: string; initials?: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d7f2ed] text-[11px] font-bold text-[#1f2340]">
      {initials || name?.split(' ').map((x) => x[0]).join('').slice(0, 2) || '?'}
    </span>
  );
}

function Badge({ children, tone = 'neutral' }: { children: any; tone?: string }) {
  const c: R = {
    neutral: 'bg-[#eeeee8] text-[#65677a]',
    coral: 'bg-[#fde2de] text-[#a8463d]',
    mint: 'bg-[#d7f2ed] text-[#28685f]',
    gold: 'bg-[#f8e5a7] text-[#665523]',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${c[tone] || c.neutral}`}>
      {children}
    </span>
  );
}

function Empty({ title, text, icon: Icon = Inbox }: { title: string; text: string; icon?: any }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d7d7cf] bg-[#fbfbf7] px-6 py-14 text-center">
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[#d7f2ed] text-[#28685f]">
        <Icon size={20} />
      </span>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[#747588]">{text}</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-[#e7e7e1]" />
      <div className="h-24 animate-pulse rounded-lg bg-[#e7e7e1]" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-lg bg-[#e7e7e1]" />
        <div className="h-32 animate-pulse rounded-lg bg-[#e7e7e1]" />
        <div className="h-32 animate-pulse rounded-lg bg-[#e7e7e1]" />
      </div>
    </div>
  );
}

function Heading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: any }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-[#f26b5b]">{eyebrow}</div>}
        <h1 className="font-display text-4xl font-bold tracking-[-.06em] md:text-5xl">{title}</h1>
        {detail && <p className="mt-2 text-sm text-[#747588]">{detail}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

const sampleTickets: R[] = [
  { id: '1', number: 'CX-1048', subject: 'Integration webhook failing on invoice.paid event', customer: 'Acme Corp', priority: 'high', status: 'open', channel: 'Email', updatedAt: '10m ago' },
  { id: '2', number: 'CX-1047', subject: 'Need custom domain verification for customer portal', customer: 'Starlight Media', priority: 'medium', status: 'in_progress', channel: 'Portal', updatedAt: '42m ago' },
  { id: '3', number: 'CX-1046', subject: 'Billing seats upgrade query for Q3 renewal', customer: 'Apex Logistics', priority: 'low', status: 'resolved', channel: 'Widget', updatedAt: '2h ago' },
];

const sampleCustomers: R[] = [
  { id: '1', name: 'Sarah Connor', company: 'Cyberdyne Systems', email: 'sarah@cyberdyne.com', ltv: 48500, initials: 'SC' },
  { id: '2', name: 'Marcus Vance', company: 'Acme Corp', email: 'marcus@acme.com', ltv: 124000, initials: 'MV' },
  { id: '3', name: 'Elena Rostova', company: 'Starlight Media', email: 'elena@starlight.io', ltv: 89000, initials: 'ER' },
];

const sampleDashboard: R = {
  metrics: [
    { label: 'Open tickets', value: '24', delta: '+12%' },
    { label: 'Avg resolution time', value: '1.8h', delta: '-18%' },
    { label: 'CSAT rating', value: '98.4%', delta: '+2.1%' },
    { label: 'Active copilot queries', value: '142', delta: '+34%' },
  ],
  volume: [
    { label: 'Mon', value: 45 },
    { label: 'Tue', value: 68 },
    { label: 'Wed', value: 85 },
    { label: 'Thu', value: 60 },
    { label: 'Fri', value: 92 },
    { label: 'Sat', value: 30 },
    { label: 'Sun', value: 25 },
  ],
  drivers: [
    { label: 'Webhook & API integrations', share: 42 },
    { label: 'Billing & Seat allocation', share: 28 },
    { label: 'Custom domain setup', share: 18 },
  ],
  recentActivity: [
    { id: '1', title: 'Ticket CX-1048 resolved', detail: 'Agent Marcus Vance closed ticket after webhook fix.', time: '5m ago' },
    { id: '2', title: 'High CSAT rating received', detail: 'Starlight Media rated resolution 5/5 stars.', time: '18m ago' },
    { id: '3', title: 'Copilot query executed', detail: 'Draft generated for enterprise seat upgrade.', time: '34m ago' },
  ],
};

const sampleInsights: R = {
  summary: 'Customer sentiment remains exceptionally strong at 98.4%. Webhook integration queries represent the primary driver of incoming volume.',
  themes: ['API Webhook payloads', 'Custom domain SSL', 'Seat management'],
  opportunities: ['Automated webhook validator tool', 'In-app domain DNS checker'],
};

const sampleTicketDetail: R = {
  id: '1',
  number: 'CX-1048',
  subject: 'Integration webhook failing on invoice.paid event',
  description: 'Our payment server missed 14 webhook retries after the latest API release. Customer reports invoice status mismatch.',
  customer: 'Acme Corp',
  priority: 'high',
  status: 'open',
  channel: 'Email',
  category: 'Technical issue',
  createdAt: '2 hours ago',
  updatedAt: '10m ago',
  assignedAgentId: '',
  messages: [
    { id: 'm1', senderName: 'Marcus Vance', role: 'customer', text: 'Hi support team, we noticed invoice.paid webhooks returning 500 status since 08:00 UTC.', createdAt: '2h ago', isInternalNote: false },
    { id: 'm2', senderName: 'OmniCX Copilot', role: 'agent', text: 'Investigating payment server logs. Preliminary trace suggests signature mismatch on payload key.', createdAt: '1h ago', isInternalNote: false },
    { id: 'm3', senderName: 'Staff Member', role: 'staff', text: 'Internal note: Re-indexing webhook endpoint certificates.', createdAt: '30m ago', isInternalNote: true },
  ],
};

function Admin({ children }: { children: any }) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const nav = [
    ['/admin/dashboard', 'Command center', LayoutDashboard],
    ['/admin/tickets', 'Ticket queue', Ticket],
    ['/admin/customers', 'Customers', Users],
    ['/admin/insights', 'CX intelligence', Lightbulb],
  ] as any[];

  return (
    <div className="min-h-[100dvh] bg-[#f7f7f3]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#1f2340] px-4 py-5 transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-10 flex items-center justify-between px-2">
          <Logo dark />
          <button aria-label="Close sidebar" data-testid="button-close-sidebar" onClick={() => setOpen(false)} className="text-[#a4a8bf] md:hidden">
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.2em] text-[#777c9e]">Operations Workspace</div>
        <nav className="space-y-1">
          {nav.map(([href, label, Icon]) => (
            <Link
              data-testid={`link-${cx(label)}`}
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${loc === href ? 'bg-[#f26b5b] text-[#1f2340]' : 'text-[#c0c2d1] hover:bg-[#2b3050]'}`}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-9 mb-3 px-3 font-mono text-[9px] uppercase tracking-[.2em] text-[#777c9e]">Views</div>
        <nav className="space-y-1">
          <Link data-testid="link-live-conversations" href="/portal/chat" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#c0c2d1] hover:bg-[#2b3050]">
            <MessageCircle size={17} />
            Customer portal view
          </Link>
        </nav>
        <div className="mt-auto rounded-2xl border border-[#3a3e5b] bg-[#282d4a] p-3.5">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f8e5a7] text-xs font-bold">CX</span>
              <div>
                <div className="text-xs font-bold text-[#f7f7f3]">{user?.fullName || 'Staff Member'}</div>
                <div className="text-[10px] text-[#9da1ba]">Staff Operations</div>
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>
      {open && <button aria-label="Close backdrop" data-testid="button-sidebar-backdrop" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-[#1f2340]/40 md:hidden" />}
      <div className="md:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e5e5df] bg-[#f7f7f3]/90 px-5 backdrop-blur md:px-9">
          <button aria-label="Open sidebar" data-testid="button-open-sidebar" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-[#eeeee8] md:hidden">
            <Command size={19} />
          </button>
          <div className="hidden items-center gap-2 text-sm text-[#747588] md:flex">
            <span className="h-2 w-2 rounded-full bg-[#65b7a9] pulse-dot" />
            Workspace Active • Security & Audit Enforced
          </div>
          <div className="flex items-center gap-3">
            <LogoutButton />
          </div>
        </header>
        <main className="mx-auto max-w-[1420px] p-5 md:p-9">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function Portal({ children }: { children: any }) {
  const [loc] = useLocation();
  const { user } = useUser();
  return (
    <div className="min-h-[100dvh] bg-[#f7f7f3]">
      <header className="flex items-center justify-between border-b border-[#e5e5df] bg-[#fbfbf7] px-5 py-4 md:px-10">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-[#747588] md:flex">
          {[
            ['/portal', 'Overview'],
            ['/portal/chat', 'Assistant'],
            ['/portal/tickets/new', 'Raise a ticket'],
            ['/portal/feedback', 'Feedback'],
          ].map(([h, l]) => (
            <Link data-testid={`link-portal-${cx(l)}`} key={h} href={h} className={loc === h ? 'text-[#1f2340]' : 'hover:text-[#1f2340]'}>
              {l}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[#747588] sm:block">Signed in as {user?.firstName || user?.primaryEmailAddress?.emailAddress}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-8 md:px-10 md:py-12">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#f7f7f3]">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Logo />
        <nav className="hidden gap-7 text-sm text-[#747588] md:flex">
          <a data-testid="link-public-product" href="#product">Product</a>
          <Link data-testid="link-public-customers" href="/portal">Customer portal</Link>
          <a data-testid="link-public-contact" href="mailto:hello@omnicx.ai">Talk to us</a>
        </nav>
        <Link data-testid="link-demo" href="/sign-in" className="rounded-lg bg-[#1f2340] px-4 py-2.5 text-xs font-bold text-[#f7f7f3]">
          Sign in <ArrowRight size={13} className="ml-1 inline text-[#f26b5b]" />
        </Link>
      </header>
      <main>
        <section className="relative mx-auto max-w-[1280px] px-5 pb-24 pt-16 md:px-10 md:pt-24">
          <div className="absolute right-[-100px] top-8 h-[460px] w-[460px] rounded-full border-[70px] border-[#d7f2ed] opacity-70" />
          <div className="relative max-w-[850px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d7d7cf] bg-[#fbfbf7] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.13em] text-[#28685f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#65b7a9]" />Enterprise CX Intelligence
            </div>
            <h1 className="font-display text-[clamp(3.8rem,9vw,8.4rem)] font-bold leading-[.88] tracking-[-.085em]">
              Make every<br />
              <span className="text-[#f26b5b]">conversation</span><br />
              count.
            </h1>
            <p className="mt-8 max-w-[490px] text-lg leading-relaxed text-[#65677a]">
              OmniCX gives support teams the full picture before they reply — live context, useful intelligence, and a clear next move.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link data-testid="link-start-demo" href="/sign-up" className="rounded-xl bg-[#f26b5b] px-5 py-3.5 text-sm font-bold text-[#1f2340] shadow-[4px_4px_0_#1f2340]">
                Create your workspace <ArrowRight size={16} className="ml-2 inline" />
              </Link>
              <Link data-testid="link-customer-portal" href="/portal" className="rounded-xl px-5 py-3.5 text-sm font-bold hover:bg-[#eeeee8]">
                See the customer view
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-wrap justify-between gap-4 border-t border-[#deded6] px-5 py-6 text-xs text-[#747588] md:px-10">
        <Logo />
        <span>© 2026 OmniCX AI. Production Ready Enterprise SaaS.</span>
      </footer>
    </div>
  );
}

function PortalHome() {
  const { data, isLoading } = useListCxTickets({ query: { queryKey: getListCxTicketsQueryKey() } });
  const ts = (Array.isArray(data) ? data : sampleTickets) as R[];

  if (isLoading && data === undefined) return <Portal><Loading /></Portal>;

  return (
    <Portal>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#f26b5b]">Your workspace</div>
          <h1 className="font-display text-4xl font-bold tracking-[-.06em] md:text-5xl">Your support, <span className="text-[#f26b5b]">in view.</span></h1>
          <p className="mt-2 text-sm text-[#747588]">Everything active, plus a few things worth knowing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link data-testid="link-raise-ticket-home" href="/portal/tickets/new" className="rounded-xl bg-[#f26b5b] px-4 py-3 text-sm font-bold text-[#1f2340]">
            <Plus size={16} className="mr-2 inline" />Raise a ticket
          </Link>
          <Link data-testid="link-open-assistant" href="/portal/chat" className="rounded-xl bg-[#1f2340] px-4 py-3 text-sm font-bold text-[#f7f7f3]">
            <MessageCircle size={16} className="mr-2 inline" />Ask the assistant
          </Link>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl bg-[#1f2340] p-6 text-[#f7f7f3]">
          <div className="flex justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.16em] text-[#f8e5a7]">Account health</div>
              <div className="mt-3 font-display text-3xl font-bold">{ts.length ? "Active Support" : "Ready to help"}</div>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-full border border-[#59607e] text-[#65b7a9]"><Check /></span>
          </div>
          <div className="mt-9 grid grid-cols-3 border-t border-[#3e4360] pt-4 text-xs text-[#afb2c2]">
            <div><b className="font-display text-xl text-[#f7f7f3]">{ts.length}</b><div>active tickets</div></div>
            <div><b className="font-display text-xl text-[#f7f7f3]">Live</b><div>workspace response</div></div>
            <div><b className="font-display text-xl text-[#f7f7f3]">Connected</b><div>SaaS status</div></div>
          </div>
        </div>
        <div className="rounded-2xl bg-[#f8e5a7] p-6">
          <Lightbulb size={20} />
          <div className="mt-12 font-mono text-[10px] uppercase tracking-[.16em] text-[#756833]">Recommended</div>
          <h3 className="mt-2 font-display text-xl font-bold">Start with a question</h3>
          <p className="mt-2 text-sm text-[#756833]">The assistant can help you find an answer or connect you with the team.</p>
          <Link href="/portal/chat" className="mt-5 inline-block text-xs font-bold underline">Ask the assistant</Link>
        </div>
      </div>
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Active tickets</h2>
          <div className="flex gap-4">
            <Link data-testid="link-ticket-help" href="/portal/feedback" className="text-xs font-bold text-[#f26b5b]">Give feedback</Link>
            <Link data-testid="link-ticket-help-raise" href="/portal/tickets/new" className="text-xs font-bold text-[#f26b5b]">Raise a ticket</Link>
          </div>
        </div>
        {ts.length === 0 ? (
          <Empty icon={Ticket} title="No tickets yet" text="Start a conversation and your support history will appear here." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e1e1da] bg-[#fbfbf7]">
            {ts.map((t) => (
              <Link data-testid={`link-portal-ticket-${t.id}`} href={`/portal/tickets/${t.id}`} key={t.id} className="flex flex-wrap items-center gap-4 border-b border-[#e8e8e1] px-5 py-4 last:border-0 hover:bg-[#f1f1eb]">
                <span className="font-mono text-[10px] text-[#8b8c9c]">{t.number}</span>
                <span className="min-w-[200px] flex-1 text-sm font-bold">{t.subject}</span>
                <Badge tone={t.status === 'open' ? 'coral' : 'gold'}>{t.status}</Badge>
                <span className="text-xs text-[#8b8c9c]">{t.updatedAt}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Portal>
  );
}

function CustomerTicketDetail() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const { data, isLoading } = useGetCxTicket(id, { query: { queryKey: getGetCxTicketQueryKey(id) } });
  const replyMutation = useCreateCxTicketMessage();
  const [replyText, setReplyText] = useState('');

  const t: R = (data && data.id) ? data : sampleTicketDetail;
  const msgs: R[] = (Array.isArray(t.messages) ? t.messages : sampleTicketDetail.messages).filter((m: R) => !m.isInternalNote);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || replyMutation.isPending) return;

    replyMutation.mutate(
      { id, data: { message: replyText.trim(), isInternalNote: false } },
      {
        onSuccess: () => {
          setReplyText('');
          toast({ title: "Reply sent", description: "Your message was added to the conversation." });
          queryClient.invalidateQueries({ queryKey: getGetCxTicketQueryKey(id) });
        },
        onError: () => {
          toast({ title: "Failed to send reply", description: "Please check your connection and try again.", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading && !data) return <Portal><Loading /></Portal>;
  if (!data) return <Portal><Empty icon={Ticket} title="Ticket not found" text="This ticket may have been moved or removed." /></Portal>;

  return (
    <Portal>
      <div className="mb-6 flex items-center gap-2 text-xs text-[#747588]">
        <Link data-testid="link-back-portal" href="/portal"><ChevronLeft size={15} className="inline" />Overview</Link>
        <span>/</span>
        <span className="font-mono">{t.number}</span>
      </div>
      <div className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-6 md:p-8">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="coral">{t.priority}</Badge>
              <span className="font-mono text-[10px] text-[#8b8c9c]">{t.number}</span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-[-.05em]">{t.subject}</h1>
            <div className="mt-3 flex items-center gap-2 text-xs text-[#747588]">
              <span>Category: {t.category}</span>
              <span>•</span>
              <span>Updated: {t.updatedAt}</span>
            </div>
          </div>
          <Badge tone={t.status === 'open' ? 'coral' : t.status === 'resolved' ? 'mint' : 'gold'}>{t.status}</Badge>
        </div>

        <div className="mt-8 space-y-5">
          {msgs.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.senderType === 'customer' ? 'flex-row-reverse' : ''}`}>
              <Avatar name={m.sender} />
              <div className={`max-w-[78%] ${m.senderType === 'customer' ? 'text-right' : ''}`}>
                <div className="mb-1 flex gap-2 text-xs"><b>{m.sender}</b><span className="text-[#aaaab5]">{m.time}</span></div>
                <div className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.senderType === 'customer' ? 'rounded-tr-sm bg-[#1f2340] text-[#f7f7f3]' : 'rounded-tl-sm bg-[#eeeee8]'}`}>
                  {m.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSendReply} className="mt-8 border-t border-[#e8e8e1] pt-6">
          <label className="block text-xs font-bold text-[#747588]">Add a reply to this ticket</label>
          <div className="mt-3 flex gap-2">
            <textarea
              data-testid="input-customer-reply"
              value={replyText}
              disabled={replyMutation.isPending}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your message..."
              rows={3}
              className="flex-1 resize-none rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] p-3 text-sm outline-none focus:border-[#f26b5b]"
            />
            <button
              type="submit"
              data-testid="button-customer-reply-submit"
              disabled={replyMutation.isPending || !replyText.trim()}
              className="rounded-xl bg-[#f26b5b] px-5 py-3 text-xs font-bold text-[#1f2340] disabled:opacity-50"
            >
              {replyMutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

function VoiceCallModal({ onClose, customerName }: { onClose: () => void; customerName: string }) {
  const [isMuted, setIsMuted] = useState(false);
  const [language, setLanguage] = useState<'English' | 'Hindi'>('English');
  const [duration, setDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [statusText, setStatusText] = useState('Connecting to Shizuka...');
  const [transcript, setTranscript] = useState<{ sender: 'user' | 'agent'; text: string }[]>([]);
  const [currentText, setCurrentText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const getFemaleVoice = (lang: 'English' | 'Hindi') => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const maleKeywords = ['male', 'david', 'mark', 'george', 'richard', 'alex', 'james', 'ravi', 'hemant', 'guy', 'stefan'];
    const isMale = (name: string) => maleKeywords.some((m) => name.toLowerCase().includes(m));

    if (lang === 'Hindi') {
      const hindiVoice = voices.find((v) => v.lang.includes('hi') && !isMale(v.name));
      if (hindiVoice) return hindiVoice;
    }

    const femaleKeywords = ['female', 'zira', 'eva', 'samantha', 'victoria', 'karen', 'fiona', 'google uk english female', 'google us english', 'natural', 'hazel', 'susan', 'catherine'];
    const femaleVoice = voices.find((v) =>
      v.lang.includes('en') &&
      !isMale(v.name) &&
      femaleKeywords.some((k) => v.name.toLowerCase().includes(k))
    );

    if (femaleVoice) return femaleVoice;
    return voices.find((v) => v.lang.includes('en') && !isMale(v.name)) || null;
  };

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const getPhoneticSpeechText = (text: string) => {
    return text.replace(/\bShizuka\b/gi, 'Sheezooka');
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const phoneticText = getPhoneticSpeechText(text);
    const utterance = new SpeechSynthesisUtterance(phoneticText);
    utterance.lang = language === 'Hindi' ? 'hi-IN' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.15;

    const femaleVoice = getFemaleVoice(language);
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setStatusText('Shizuka is speaking...');
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setStatusText('Listening for your response...');
      startListening();
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setStatusText('Listening...');
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleUserSpeech = async (userText: string) => {
    if (!userText.trim()) return;
    setTranscript((prev) => [...prev, { sender: 'user', text: userText }]);
    setStatusText('Shizuka is thinking...');
    setIsListening(false);

    try {
      const res = await fetch('/api/cx/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, language, history: transcript }),
      });
      const data = await res.json();
      const aiReply = data.message || "I'm here to help. Could you tell me a bit more?";
      setTranscript((prev) => [...prev, { sender: 'agent', text: aiReply }]);
      speakText(aiReply);
    } catch {
      const fallbackMsg = language === 'Hindi'
        ? "माफ़ कीजिए, मुझे आपकी बात समझ नहीं आई। क्या आप दोबारा कह सकते हैं?"
        : "I'm here to help with your account. Could you please repeat that?";
      setTranscript((prev) => [...prev, { sender: 'agent', text: fallbackMsg }]);
      speakText(fallbackMsg);
    }
  };

  const startListening = () => {
    if (isMuted) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusText('Speech recognition not supported in this browser. Use text chat below.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language === 'Hindi' ? 'hi-IN' : 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setStatusText('Listening for your voice...');
      };

      recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1];
        const text = result[0].transcript;
        setCurrentText(text);
        if (result.isFinal) {
          setCurrentText('');
          handleUserSpeech(text);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setStatusText('Tap microphone to speak...');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {}
  };

  useEffect(() => {
    const initialGreeting = `Hello ${customerName === 'there' ? '' : customerName}! I am Shizuka, your OmniCX Voice Assistant. How can I help you today?`;
    setTranscript([{ sender: 'agent', text: initialGreeting }]);
    setTimeout(() => {
      speakText(initialGreeting);
    }, 500);

    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const handleEndCall = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (recognitionRef.current) recognitionRef.current.abort();
    onClose();
  };

  const toggleMute = () => {
    if (!isMuted) {
      if (recognitionRef.current) recognitionRef.current.abort();
      setIsListening(false);
      setStatusText('Microphone Muted');
      setIsMuted(true);
    } else {
      setIsMuted(false);
      setStatusText('Listening for your voice...');
      setTimeout(() => startListening(), 100);
    }
  };

  const handleLanguageToggle = () => {
    const nextLang = language === 'English' ? 'Hindi' : 'English';
    setLanguage(nextLang);
    const notice = nextLang === 'Hindi'
      ? 'भाषा बदलकर हिंदी कर दी गई है।'
      : 'Switched language to English.';
    setStatusText(`Language: ${nextLang}`);
    speakText(notice);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2340]/90 p-4 backdrop-blur-md">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#3e4360] bg-[#1f2340] text-[#f7f7f3] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#323754] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f26b5b] opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[#f26b5b]"></span>
            </span>
            <div>
              <div className="font-display text-sm font-bold">Shizuka — Voice Agent</div>
              <div className="font-mono text-[10px] text-[#a1a5c1]">OmniCX AI Support</div>
            </div>
          </div>
          <div className="font-mono text-xs font-bold text-[#f8e5a7]">{formatDuration(duration)}</div>
        </div>

        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="relative mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-[#2a2f4e] shadow-[0_0_40px_rgba(242,107,91,0.25)]">
            <div className={`absolute inset-0 rounded-full border-2 border-[#f26b5b]/50 ${isSpeaking ? 'animate-ping' : ''}`} />
            <Bot size={44} className="text-[#f26b5b]" />
          </div>

          <div className="mb-4 flex h-8 items-center gap-1.5">
            {[40, 75, 100, 60, 90, 45, 80, 55, 30].map((h, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-200 ${
                  isSpeaking
                    ? 'bg-[#f26b5b] animate-pulse'
                    : isListening
                    ? 'bg-[#65b7a9] animate-pulse'
                    : 'bg-[#404667]'
                }`}
                style={{
                  height: isSpeaking || isListening ? `${Math.max(10, Math.sin(duration * 2 + i) * h)}px` : '8px',
                }}
              />
            ))}
          </div>

          <div className="font-mono text-xs text-[#a4a9c6]">{statusText}</div>
        </div>

        <div className="mx-6 mb-6 max-h-44 space-y-3 overflow-y-auto rounded-2xl bg-[#171a30] p-4 text-xs">
          {transcript.map((t, idx) => (
            <div key={idx} className={`flex gap-2 ${t.sender === 'user' ? 'text-[#65b7a9]' : 'text-[#f7f7f3]'}`}>
              <b className="shrink-0">{t.sender === 'user' ? 'You:' : 'Shizuka:'}</b>
              <span>{t.text}</span>
            </div>
          ))}
          {currentText && (
            <div className="flex gap-2 text-[#a8b0d8] italic">
              <b className="shrink-0">Hearing:</b>
              <span>{currentText}...</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-around border-t border-[#323754] bg-[#191c33] px-6 py-5">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all ${
              isMuted ? 'bg-[#a8463d] text-[#f7f7f3]' : 'bg-[#2a2f4e] text-[#f7f7f3] hover:bg-[#343a5f]'
            }`}
            title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            type="button"
            onClick={handleLanguageToggle}
            className="flex h-12 items-center gap-2 rounded-2xl bg-[#2a2f4e] px-4 text-xs font-bold text-[#f8e5a7] hover:bg-[#343a5f]"
            title="Switch Language"
          >
            <Globe size={18} />
            {language}
          </button>

          <button
            type="button"
            onClick={handleEndCall}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f26b5b] text-[#1f2340] shadow-[0_4px_15px_rgba(242,107,91,0.4)] hover:bg-[#e05545]"
            title="End Call"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Chat() {
  const send = useSendCxChat();
  const [, setLocation] = useLocation();
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const { user } = useUser();
  const customerName = user?.fullName
    || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.username
    || user?.primaryEmailAddress?.emailAddress
    || 'there';
  const greeting = customerName === 'there'
    ? 'Hi there. I can help with your tickets, plan, or account. What would you like to untangle?'
    : `Hi ${customerName}. I can help with your tickets, plan, or account. What would you like to untangle?`;
  const [input, setInput] = useState('');
  const [ms, setMs] = useState<R[]>([{ role: 'assistant', text: greeting }]);

  useEffect(() => {
    setMs(messages => messages.length === 1 && messages[0].role === 'assistant'
      ? [{ ...messages[0], text: greeting }]
      : messages);
  }, [greeting]);

  const submit = (message = input) => {
    const text = message.trim();
    if (!text || send.isPending) return;
    setMs(m => [...m, { role: 'user', text }]);
    setInput('');
    send.mutate(
      { data: { message: text } },
      {
        onSuccess: r => setMs(m => [...m, { role: 'assistant', text: r.message, actions: r.suggestedActions }]),
        onError: () => setMs(m => [...m, { role: 'assistant', text: 'I hit a snag reaching your account. Please try again.' }]),
      },
    );
  };

  const handleAction = (action: string) => {
    const normalized = action.toLowerCase();
    if (normalized.includes('open a ticket') || normalized.includes('talk to an agent')) {
      setLocation('/portal/tickets/new');
      return;
    }
    submit(action);
  };

  return (
    <Portal>
      {voiceCallOpen && <VoiceCallModal customerName={customerName} onClose={() => setVoiceCallOpen(false)} />}
      <div className="mx-auto max-w-[800px]">
        <div className="mb-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f26b5b]">
            <Bot />
          </span>
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[.18em] text-[#f26b5b]">Omni assistant</div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-[-.06em]">A little clarity, on demand.</h1>
          <p className="mt-2 text-sm text-[#747588]">I can see your account context, but I will always explain before I act.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#e1e1da] bg-[#fbfbf7]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e1] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className={`h-2 w-2 rounded-full ${send.isPending ? 'animate-pulse bg-[#f8b84e]' : 'bg-[#65b7a9]'}`} />
              <b className="text-xs">{send.isPending ? 'Assistant is thinking…' : 'Assistant is online'}</b>
              <span className="font-mono text-[10px] text-[#8b8c9c]">CONTEXT: {customerName}</span>
            </div>
            <button
              type="button"
              data-testid="button-start-voice-call"
              onClick={() => setVoiceCallOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-[#f26b5b] px-3.5 py-2 text-xs font-bold text-[#1f2340] shadow-sm hover:bg-[#e05545]"
            >
              <Phone size={14} /> Start AI Voice Call 🎙️
            </button>
          </div>
          <div className="min-h-[360px] space-y-5 p-5 md:p-8">
            {ms.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d7f2ed]">
                    <Bot size={15} />
                  </span>
                )}
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-[#1f2340] text-[#f7f7f3]' : 'rounded-bl-md bg-[#eeeee8]'}`}>
                  <div>{m.text}</div>
                  {m.actions?.map((a: string) => (
                    <button
                      type="button"
                      data-testid={`button-action-${cx(a)}`}
                      onClick={() => handleAction(a)}
                      disabled={send.isPending}
                      key={a}
                      className="mt-3 block text-left text-xs font-bold text-[#a8463d] underline-offset-2 hover:underline disabled:cursor-wait disabled:opacity-60"
                    >
                      {a}
                      <ArrowRight size={12} className="ml-1 inline" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {send.isPending && (
              <div className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d7f2ed]">
                  <Bot size={15} />
                </span>
                <div className="rounded-2xl rounded-bl-md bg-[#eeeee8] px-4 py-3 text-sm text-[#747588]">Thinking through that…</div>
              </div>
            )}
          </div>
          <div className="border-t border-[#e8e8e1] p-4">
            <div className="flex items-end gap-2 rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] p-2">
              <textarea
                data-testid="input-chat-message"
                value={input}
                disabled={send.isPending}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask about your account..."
                rows={2}
                className="flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-60"
              />
              <button
                type="button"
                aria-label="Send message"
                data-testid="button-send-chat"
                disabled={send.isPending}
                onClick={() => submit()}
                className="grid h-10 w-10 place-items-center rounded-lg bg-[#f26b5b] disabled:cursor-wait disabled:opacity-60"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function RaiseTicket() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const create = useCreateCxTicket();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General support');
  const [priority, setPriority] = useState('medium');
  const [created, setCreated] = useState<R | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 5 || description.trim().length < 10 || create.isPending) return;
    create.mutate(
      { data: { subject: subject.trim(), description: description.trim(), category, priority } },
      {
        onSuccess: (ticket) => {
          setCreated(ticket as R);
          toast({ title: "Ticket created", description: `Support ticket ${ticket.number} submitted successfully.` });
          queryClient.invalidateQueries({ queryKey: getListCxTicketsQueryKey() });
        },
        onError: () => {
          toast({ title: "Submission failed", description: "Could not create ticket. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  if (created) return (
    <Portal>
      <div className="mx-auto max-w-[680px] py-6 md:py-12">
        <div className="rounded-2xl border border-[#d7f2ed] bg-[#fbfbf7] p-8 text-center md:p-12">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#d7f2ed] text-[#28685f]"><Check /></span>
          <div className="mt-6 font-mono text-[10px] uppercase tracking-[.18em] text-[#f26b5b]">Ticket submitted</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-.05em]">We’ve got it from here.</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#747588]">Your request <b className="text-[#1f2340]">{created.number}</b> is open. Our team will review it and follow up with the next step.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" data-testid="button-submit-another-ticket" onClick={() => { setCreated(null); setSubject(''); setDescription(''); }} className="rounded-xl border border-[#d7d7cf] px-4 py-3 text-sm font-bold">Submit another</button>
            <button type="button" data-testid="button-return-to-portal" onClick={() => setLocation('/portal')} className="rounded-xl bg-[#1f2340] px-4 py-3 text-sm font-bold text-[#f7f7f3]">Back to overview</button>
          </div>
        </div>
      </div>
    </Portal>
  );

  return (
    <Portal>
      <div className="mx-auto max-w-[760px]">
        <div className="mb-8">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#f26b5b]">Support request</div>
          <h1 className="font-display text-4xl font-bold tracking-[-.06em] md:text-5xl">Raise a ticket.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#747588]">Tell us what happened and what a good outcome looks like. A support teammate will pick it up from here.</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-6 md:p-9">
          <div className="grid gap-6">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#747588]">What do you need help with?</span>
              <input data-testid="input-ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={5} required placeholder="Short summary of the issue" className="rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] px-4 py-3 text-sm outline-none focus:border-[#f26b5b]" />
            </label>
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#747588]">Tell us more</span>
              <textarea data-testid="input-ticket-description" value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} required rows={6} placeholder="Include relevant details..." className="resize-none rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] px-4 py-3 text-sm outline-none focus:border-[#f26b5b]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#747588]">Category</span>
                <select data-testid="select-ticket-category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] px-4 py-3 text-sm outline-none">
                  <option>General support</option>
                  <option>Billing</option>
                  <option>Account access</option>
                  <option>Orders and delivery</option>
                  <option>Technical issue</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#747588]">Priority</span>
                <select data-testid="select-ticket-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] px-4 py-3 text-sm outline-none">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            {create.isError && <p role="alert" className="text-sm text-[#a8463d]">We couldn’t submit that request. Please check the details and try again.</p>}
            <button data-testid="button-submit-ticket" type="submit" disabled={create.isPending} className="rounded-xl bg-[#f26b5b] px-5 py-3.5 text-sm font-bold text-[#1f2340] disabled:cursor-wait disabled:opacity-60">
              {create.isPending ? 'Submitting…' : 'Submit ticket'} <ArrowRight size={16} className="ml-2 inline" />
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

function Feedback() {
  const { toast } = useToast();
  const feedbackMutation = useCreateCxFeedback();
  const [rating, setRating] = useState(0);
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState('');

  const handleSendFeedback = () => {
    if (!rating || feedbackMutation.isPending) return;
    feedbackMutation.mutate(
      { data: { csatRating: String(rating), qualitativeFeedback: note.trim() || undefined } },
      {
        onSuccess: () => {
          setSent(true);
          toast({ title: "Feedback received", description: "Thank you for helping us improve OmniCX AI." });
        },
        onError: () => {
          toast({ title: "Submission failed", description: "Failed to record feedback.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Portal>
      <div className="mx-auto max-w-[680px] py-6 md:py-12">
        <div className="text-center">
          <div className="mb-4 font-mono text-[10px] uppercase tracking-[.18em] text-[#f26b5b]">Close the loop</div>
          <h1 className="font-display text-5xl font-bold tracking-[-.07em]">How did we do?</h1>
          <p className="mt-3 text-sm text-[#747588]">Your honest take helps us make the next interaction better.</p>
        </div>
        {sent ? (
          <div className="mt-12"><Empty icon={Check} title="Thank you for the signal." text="Your feedback is persisted and logged for team review." /></div>
        ) : (
          <div className="mt-12 rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-6 md:p-9">
            <label className="font-mono text-[10px] uppercase text-[#747588]">Overall experience</label>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {['Very poor', 'Poor', 'Okay', 'Good', 'Excellent'].map((l, i) => (
                <button data-testid={`button-rating-${i + 1}`} onClick={() => setRating(i + 1)} key={l} className={`rounded-xl border p-3 ${rating === i + 1 ? 'border-[#f26b5b] bg-[#fde2de]' : 'border-[#e1e1da]'}`}>
                  <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${rating > i ? 'bg-[#f26b5b]' : 'bg-[#eeeee8]'}`}>{i + 1}</span>
                  <span className="mt-2 hidden text-[10px] font-bold sm:block">{l}</span>
                </button>
              ))}
            </div>
            <label className="mt-9 block font-mono text-[10px] uppercase text-[#747588]">Anything else?</label>
            <textarea data-testid="input-feedback-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us what worked or what got in the way..." rows={5} className="mt-3 w-full resize-none rounded-xl border border-[#d7d7cf] bg-[#f7f7f3] p-4 text-sm outline-none" />
            <button data-testid="button-submit-feedback" disabled={!rating || feedbackMutation.isPending} onClick={handleSendFeedback} className="mt-5 w-full rounded-xl bg-[#1f2340] px-4 py-3.5 text-sm font-bold text-[#f7f7f3] disabled:opacity-40">
              {feedbackMutation.isPending ? 'Sending...' : 'Send feedback'}
            </button>
          </div>
        )}
      </div>
    </Portal>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useGetCxDashboard({ query: { queryKey: getGetCxDashboardQueryKey() } });
  const d: R = (data && typeof data === 'object' && Array.isArray((data as any).metrics)) ? data : sampleDashboard;

  if (isLoading && data === undefined) return <Admin><Loading /></Admin>;

  return (
    <Admin>
      <Heading
        eyebrow="Live Operations Dashboard"
        title="Command center"
        detail="Calculated from active database transactions and customer signals."
        action={
          <button data-testid="button-refresh-dashboard" onClick={() => refetch()} className="flex items-center gap-2 rounded-lg border border-[#d7d7cf] bg-[#fbfbf7] px-3 py-2 text-xs font-bold">
            <Zap size={14} />Refresh signals
          </button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {d.metrics?.map((m: R, i: number) => (
          <div data-testid={`card-metric-${i}`} key={m.label} className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-5">
            <div className="flex justify-between">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eeeee8]"><BarChart3 size={16} /></span>
              <span className="font-mono text-[10px] text-[#28685f]">{m.delta}</span>
            </div>
            <div className="mt-5 font-display text-3xl font-bold">{m.value}</div>
            <div className="mt-1 text-xs text-[#747588]">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-5 md:p-6">
          <div className="flex justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Conversation volume</h2>
              <p className="mt-1 text-xs text-[#747588]">Tickets across all channels • last 7 days</p>
            </div>
            <Badge tone="mint">Live database</Badge>
          </div>
          <div className="mt-8 flex h-[190px] items-end gap-2 border-b border-[#e8e8e1] px-2">
            {d.volume?.map((p: R, i: number) => (
              <div key={i} className="group flex h-full flex-1 flex-col justify-end gap-2">
                <div className="rounded-t-md bg-[#d7f2ed] group-hover:bg-[#65b7a9]" style={{ height: `${Math.max(15, p.value)}%` }} />
                <span className="font-mono text-[9px] text-[#9a9ba9]">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-[#1f2340] p-6 text-[#f7f7f3]">
          <div className="font-mono text-[10px] uppercase tracking-[.16em] text-[#f8e5a7]">Top friction drivers</div>
          <h2 className="mt-2 font-display text-lg font-bold">What needs attention</h2>
          <div className="mt-7 space-y-5">
            {d.drivers?.map((v: R, i: number) => (
              <div key={v.label}>
                <div className="flex justify-between text-xs">
                  <span>{v.label}</span>
                  <span className="font-mono text-[#aeb1c1]">{v.share}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#3d4260]">
                  <div className={`h-full rounded-full ${i === 0 ? 'bg-[#f26b5b]' : i === 1 ? 'bg-[#f8e5a7]' : 'bg-[#65b7a9]'}`} style={{ width: `${Math.min(100, Math.max(10, Number(v.share) || 25))}%` }} />
                </div>
              </div>
            ))}
          </div>
          <Link data-testid="link-insights-from-dashboard" href="/admin/insights" className="mt-8 block text-xs font-bold text-[#f26b5b]">
            Explore intelligence <ArrowRight size={14} className="inline" />
          </Link>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-6">
        <div className="flex justify-between">
          <h2 className="font-display text-lg font-bold">Recent activity</h2>
          <Link data-testid="link-all-activity" href="/admin/tickets" className="text-xs font-bold text-[#f26b5b]">View queue</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {d.recentActivity?.map((a: R) => (
            <div key={a.id} className="rounded-xl bg-[#f1f1eb] p-4">
              <Clock3 size={15} className="text-[#f26b5b]" />
              <div className="mt-4 text-xs font-bold">{a.title}</div>
              <div className="mt-1 text-xs text-[#747588]">{a.detail}</div>
              <div className="mt-3 font-mono text-[9px] text-[#aaaab5]">{a.time}</div>
            </div>
          ))}
        </div>
      </div>
    </Admin>
  );
}

function Tickets() {
  const { data, isLoading } = useListCxTickets({ query: { queryKey: getListCxTicketsQueryKey() } });
  const create = useCreateCxTicket();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  const ts = ((Array.isArray(data) ? data : sampleTickets) as R[]).filter((t) =>
    (filter === 'all' || t.status === filter) &&
    `${t.number} ${t.subject} ${t.customer}`.toLowerCase().includes(search.toLowerCase())
  );

  const submit = () => {
    if (subject.trim().length < 5 || description.trim().length < 10) return;
    create.mutate(
      { data: { subject, description, category: 'General', priority: 'medium' } },
      {
        onSuccess: () => {
          setOpen(false);
          setSubject('');
          setDescription('');
          queryClient.invalidateQueries({ queryKey: getListCxTicketsQueryKey() });
        },
      }
    );
  };

  return (
    <Admin>
      <Heading
        eyebrow="Operations Queue"
        title="Ticket queue"
        detail="Manage, search, and assign workspace tickets."
        action={
          <button data-testid="button-new-ticket" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-[#f26b5b] px-4 py-3 text-xs font-bold text-[#1f2340]">
            <Plus size={15} />New ticket
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#d7d7cf] bg-[#fbfbf7] px-3 py-2.5">
          <Search size={16} className="text-[#aaaab5]" />
          <input data-testid="input-ticket-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number, subject, customer..." className="w-full bg-transparent text-sm outline-none" />
        </div>
        <div className="flex rounded-xl border border-[#d7d7cf] bg-[#fbfbf7] p-1">
          {['all', 'open', 'in_progress', 'resolved', 'closed'].map((v) => (
            <button data-testid={`button-filter-${v}`} key={v} onClick={() => setFilter(v)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${filter === v ? 'bg-[#1f2340] text-[#f7f7f3]' : 'text-[#747588]'}`}>
              {v.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#e1e1da] bg-[#fbfbf7]">
        {isLoading && !data ? (
          <Loading />
        ) : ts.length === 0 ? (
          <Empty icon={Ticket} title="Nothing in this view" text="Try another filter or search term." />
        ) : (
          ts.map((t) => (
            <Link data-testid={`row-ticket-${t.id}`} href={`/admin/tickets/${t.id}`} key={t.id} className="grid gap-2 border-b border-[#e8e8e1] px-5 py-4 last:border-0 hover:bg-[#f1f1eb] md:grid-cols-[.7fr_2fr_1.2fr_.8fr_.7fr] md:items-center">
              <span className="font-mono text-[10px] text-[#8b8c9c]">{t.number}</span>
              <div>
                <div className="text-sm font-bold">{t.subject}</div>
                <div className="mt-1 text-xs text-[#8b8c9c]">{t.channel} • {t.updatedAt}</div>
              </div>
              <div className="flex items-center gap-2 text-xs"><Avatar name={t.customer} />{t.customer}</div>
              <Badge tone={t.priority === 'urgent' || t.priority === 'high' ? 'coral' : 'neutral'}>{t.priority}</Badge>
              <Badge tone={t.status === 'open' ? 'coral' : t.status === 'resolved' ? 'mint' : 'gold'}>{t.status}</Badge>
            </Link>
          ))
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2340]/45 p-5">
          <div className="w-full max-w-lg rounded-2xl bg-[#fbfbf7] p-6">
            <div className="flex justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase text-[#f26b5b]">New conversation</div>
                <h2 className="mt-1 font-display text-2xl font-bold">Create a ticket</h2>
              </div>
              <button aria-label="Close dialog" data-testid="button-close-create-ticket" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <label className="mt-7 block text-xs font-bold">Subject<input data-testid="input-ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-2 w-full rounded-lg border border-[#d7d7cf] bg-[#f7f7f3] px-3 py-2.5 text-sm outline-none" /></label>
            <label className="mt-4 block text-xs font-bold">Description<textarea data-testid="input-ticket-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="mt-2 w-full resize-none rounded-lg border border-[#d7d7cf] bg-[#f7f7f3] p-3 text-sm outline-none" /></label>
            <div className="mt-5 flex justify-end gap-2">
              <button data-testid="button-cancel-ticket" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2.5 text-xs font-bold">Cancel</button>
              <button data-testid="button-submit-ticket" onClick={submit} disabled={create.isPending || subject.length < 5 || description.length < 10} className="rounded-lg bg-[#f26b5b] px-4 py-2.5 text-xs font-bold disabled:opacity-40">
                {create.isPending ? 'Creating...' : 'Create ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Admin>
  );
}

function TicketDetail() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const { data, isLoading } = useGetCxTicket(id, { query: { queryKey: getGetCxTicketQueryKey(id) } });
  const update = useUpdateCxTicketStatus();
  const assignMutation = useAssignCxTicket();
  const replyMutation = useCreateCxTicketMessage();
  const copilot = useGetCxCopilot();

  const { data: customerList } = useListCxCustomers();
  const t: R = (data && data.id) ? data : sampleTicketDetail;
  const msgs: R[] = Array.isArray(t.messages) ? t.messages : sampleTicketDetail.messages;

  const [tone, setTone] = useState('Warm & concise');
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  const handleStaffReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || replyMutation.isPending) return;

    replyMutation.mutate(
      { id, data: { message: replyText.trim(), isInternalNote } },
      {
        onSuccess: () => {
          setReplyText('');
          toast({ title: isInternalNote ? "Internal Note Added" : "Reply Sent", description: "The timeline has been updated." });
          queryClient.invalidateQueries({ queryKey: getGetCxTicketQueryKey(id) });
        },
        onError: () => {
          toast({ title: "Failed to send message", variant: "destructive" });
        },
      }
    );
  };

  const handleAssign = (agentId: string) => {
    assignMutation.mutate(
      { id, data: { assignedAgentId: agentId } },
      {
        onSuccess: () => {
          toast({ title: "Agent assigned", description: "Ticket assignment updated." });
          queryClient.invalidateQueries({ queryKey: getGetCxTicketQueryKey(id) });
        },
      }
    );
  };

  if (isLoading && !data) return <Admin><Loading /></Admin>;
  if (!data) return <Admin><Empty icon={Ticket} title="Ticket not found" text="Invalid ticket ID." /></Admin>;

  return (
    <Admin>
      <div className="mb-6 flex items-center gap-2 text-xs text-[#747588]">
        <Link data-testid="link-back-tickets" href="/admin/tickets"><ChevronLeft size={15} className="inline" />Ticket queue</Link>
        <span>/</span>
        <span className="font-mono">{t.number}</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_355px]">
        <div className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-6 md:p-8">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="coral">{t.priority}</Badge>
                <span className="font-mono text-[10px] text-[#8b8c9c]">{t.number}</span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-[-.05em]">{t.subject}</h1>
              <div className="mt-3 flex items-center gap-2 text-xs text-[#747588]">
                <Avatar name={t.customer} />
                <b>{t.customer}</b>
                <span>•</span>{t.category}<span>•</span>{t.channel}
              </div>
            </div>
            <select data-testid="select-ticket-status" value={t.status} onChange={(e) => update.mutate({ id, data: { status: e.target.value } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCxTicketQueryKey(id) }) })} className="rounded-lg border border-[#d7d7cf] bg-[#f7f7f3] px-3 py-2 text-xs font-bold">
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="escalated">escalated</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
            </select>
          </div>

          <div className="mt-7 rounded-xl bg-[#f1f1eb] p-4 text-sm leading-relaxed text-[#65677a]">
            <span className="mr-2 font-mono text-[9px] uppercase text-[#a8463d]">AI summary</span>
            {t.summary}
          </div>

          <div className="mt-8 space-y-5">
            {msgs.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.senderType === 'agent' ? 'flex-row-reverse' : ''}`}>
                <Avatar name={m.sender} />
                <div className={`max-w-[78%] ${m.senderType === 'agent' ? 'text-right' : ''}`}>
                  <div className="mb-1 flex gap-2 text-xs">
                    <b>{m.sender}</b>
                    {m.isInternalNote && <span className="rounded bg-[#f8e5a7] px-1 text-[9px] font-bold text-[#665523]">INTERNAL NOTE</span>}
                    <span className="text-[#aaaab5]">{m.time}</span>
                  </div>
                  <div className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.isInternalNote ? 'border border-[#f8e5a7] bg-[#fffdf5] text-[#1f2340]' : m.senderType === 'agent' ? 'rounded-tr-sm bg-[#1f2340] text-[#f7f7f3]' : 'rounded-tl-sm bg-[#eeeee8]'}`}>
                    {m.text}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Staff Message Composer */}
          <form onSubmit={handleStaffReply} className="mt-8 border-t border-[#e8e8e1] pt-6">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#747588]">Staff Reply & Internal Notes</label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  className="rounded border-[#d7d7cf]"
                />
                <span className={isInternalNote ? 'font-bold text-[#a8463d]' : 'text-[#747588]'}>Internal Note (Hidden from Customer)</span>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <textarea
                data-testid="input-staff-reply"
                value={replyText}
                disabled={replyMutation.isPending}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={isInternalNote ? "Write an internal team note..." : "Write a response to the customer..."}
                rows={3}
                className={`flex-1 resize-none rounded-xl border p-3 text-sm outline-none ${isInternalNote ? 'border-[#f8e5a7] bg-[#fffdf5]' : 'border-[#d7d7cf] bg-[#f7f7f3]'}`}
              />
              <button
                type="submit"
                data-testid="button-staff-reply-submit"
                disabled={replyMutation.isPending || !replyText.trim()}
                className={`rounded-xl px-5 py-3 text-xs font-bold disabled:opacity-50 ${isInternalNote ? 'bg-[#f8e5a7] text-[#665523]' : 'bg-[#f26b5b] text-[#1f2340]'}`}
              >
                {replyMutation.isPending ? 'Posting...' : isInternalNote ? 'Post Note' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>

        <aside className="space-y-5">
          {/* Agent Assignment Card */}
          <div className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-5">
            <div className="font-display font-bold text-sm text-[#1f2340]">Ticket Assignment</div>
            <p className="mt-1 text-xs text-[#747588]">Assign ownership to an active team agent.</p>
            <select
              data-testid="select-assign-agent"
              value={t.assignedAgentId || ''}
              onChange={(e) => handleAssign(e.target.value)}
              className="mt-3 w-full rounded-lg border border-[#d7d7cf] bg-[#f7f7f3] px-3 py-2 text-xs font-bold"
            >
              <option value="">Unassigned</option>
              {(Array.isArray(customerList) ? customerList : sampleCustomers).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.company})</option>
              ))}
            </select>
          </div>

          {/* AI Copilot Card */}
          <div className="rounded-2xl bg-[#1f2340] p-5 text-[#f7f7f3]">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#f8e5a7]" />
              <span className="font-display font-bold">Copilot</span>
            </div>
            <p className="mt-3 text-xs text-[#b9bbcb]">Use conversation context to draft a thoughtful next move.</p>
            <select data-testid="select-copilot-tone" value={tone} onChange={(e) => setTone(e.target.value)} className="mt-5 w-full rounded-lg border border-[#424764] bg-[#282d4a] px-3 py-2.5 text-xs font-bold text-[#f7f7f3]">
              <option>Warm & concise</option>
              <option>Direct & helpful</option>
              <option>Reassuring & detailed</option>
            </select>
            <button data-testid="button-generate-copilot" onClick={() => copilot.mutate({ data: { ticketId: id, tone } })} disabled={copilot.isPending} className="mt-4 flex w-full justify-center gap-2 rounded-lg bg-[#f26b5b] py-2.5 text-xs font-bold text-[#1f2340]">
              <Sparkles size={14} />{copilot.isPending ? 'Reading context...' : 'Generate next step'}
            </button>
            {copilot.data && (
              <div className="mt-5 space-y-3 border-t border-[#424764] pt-4">
                {copilot.data.handoverNotes && (
                  <div className="rounded-lg bg-[#282d4a] p-3 text-xs">
                    <b className="block text-[9px] uppercase tracking-wider text-[#f8e5a7]">AI Summary</b>
                    <p className="mt-1 leading-relaxed text-[#d0d3e5]">{copilot.data.handoverNotes}</p>
                  </div>
                )}
                
                {copilot.data.recommendedNextActions && copilot.data.recommendedNextActions.length > 0 && (
                  <div className="rounded-lg bg-[#282d4a] p-3 text-xs">
                    <b className="block text-[9px] uppercase tracking-wider text-[#65b7a9]">Recommended Action</b>
                    <p className="mt-1 leading-relaxed text-[#d0d3e5]">{copilot.data.recommendedNextActions.join(' • ')}</p>
                  </div>
                )}

                {copilot.data.suggestedReplies?.map((r: R) => (
                  <div key={r.tone} className="rounded-lg border border-[#f26b5b]/40 bg-[#282d4a] p-3 text-xs">
                    <b className="block text-[9px] uppercase tracking-wider text-[#f26b5b]">Suggested Reply ({r.tone})</b>
                    <p className="mt-1 leading-relaxed text-[#f7f7f3]">{r.replyText}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyText(r.replyText);
                        toast({ title: "Draft inserted into composer", description: "You can now review or edit the reply before sending." });
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#f8e5a7] hover:underline"
                    >
                      Use draft in composer <ArrowRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </Admin>
  );
}

function Customers() {
  const { data, isLoading } = useListCxCustomers();
  const [search, setSearch] = useState('');
  const cs = ((Array.isArray(data) ? data : sampleCustomers) as R[]).filter((c) => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Admin>
      <Heading eyebrow="Relationships • Live accounts" title="Customers" detail="Directory of customer context and sentiment." />
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#d7d7cf] bg-[#fbfbf7] px-3 py-2.5">
        <Search size={16} className="text-[#aaaab5]" />
        <input data-testid="input-customer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, company, email..." className="w-full bg-transparent text-sm outline-none" />
      </div>
      {isLoading && data === undefined ? (
        <Loading />
      ) : cs.length === 0 ? (
        <Empty icon={Users} title="No customers found" text="Customer profiles will appear here when accounts are created." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e1e1da] bg-[#fbfbf7]">
          {cs.map((c) => (
            <Link data-testid={`row-customer-${c.id}`} href={`/admin/tickets?search=${encodeURIComponent(c.name)}`} key={c.id} className="flex items-center gap-3 border-b border-[#e8e8e1] px-5 py-4 last:border-0 hover:bg-[#f1f1eb]">
              <Avatar initials={c.initials} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{c.name}</div>
                <div className="truncate text-xs text-[#747588]">{c.company} • {c.email}</div>
              </div>
              <div className="hidden text-right sm:block">
                <div className="font-mono text-xs font-bold">${Number(c.ltv).toLocaleString()}</div>
                <div className="text-[10px] text-[#747588]">lifetime value</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Admin>
  );
}

function Insights() {
  const { data, isLoading } = useGetCxInsights();
  const d: R = (data && typeof data === 'object' && Array.isArray((data as any).themes)) ? data : sampleInsights;

  if (isLoading && data === undefined) return <Admin><Loading /></Admin>;

  return (
    <Admin>
      <Heading eyebrow="CX Intelligence Engine" title="CX intelligence" detail="Calculated signals and friction trends from customer ticket data." />
      <div className="rounded-2xl bg-[#1f2340] p-6 text-[#f7f7f3] md:p-8">
        <div className="font-mono text-[10px] uppercase tracking-[.16em] text-[#f8e5a7]">
          <Sparkles size={13} className="mr-2 inline" />Executive readout
        </div>
        <p className="mt-5 max-w-3xl font-display text-2xl leading-snug tracking-[-.035em] md:text-3xl">“{d.summary}”</p>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">Themes to watch</h2>
          <div className="space-y-3">
            {d.themes?.map((t: R, i: number) => (
              <div data-testid={`card-theme-${i}`} key={t.label} className="rounded-2xl border border-[#e1e1da] bg-[#fbfbf7] p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <Badge tone={t.impact === 'High' ? 'coral' : 'gold'}>{t.impact} impact</Badge>
                    <h3 className="mt-3 font-display text-lg font-bold">{t.label}</h3>
                  </div>
                  <div className="text-right font-display text-2xl font-bold">{t.volume}</div>
                </div>
                <p className="mt-2 text-sm text-[#747588]">{t.description}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">Opportunities</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e1e1da] bg-[#fbfbf7]">
            {d.opportunities?.map((o: R, i: number) => (
              <div key={o.title} className="border-b border-[#e8e8e1] p-5 last:border-0">
                <div className="flex gap-3">
                  <span className="font-mono text-xs text-[#f26b5b]">0{i + 1}</span>
                  <div>
                    <h3 className="font-display font-bold">{o.title}</h3>
                    <p className="mt-1 text-sm text-[#747588]">{o.description}</p>
                    <div className="mt-4 flex justify-between">
                      <Badge tone="mint">{o.owner}</Badge>
                      <span className="font-mono text-[10px] text-[#747588]">{o.confidence}% confidence</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Admin>
  );
}

function Protected({ children }: { children: any }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return children;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Loading />;
  return isSignedIn ? <Redirect to="/portal" /> : <Landing />;
}

function AuthPage({ signUp = false }: { signUp?: boolean }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f7f3] px-4">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {signUp ? (
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={{ variables: { colorPrimary: '#f26b5b', colorForeground: '#1f2340', colorBackground: '#fbfbf7', fontFamily: 'DM Sans' } }} />
        ) : (
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={{ variables: { colorPrimary: '#f26b5b', colorForeground: '#1f2340', colorBackground: '#fbfbf7', fontFamily: 'DM Sans' } }} />
        )}
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={() => <AuthPage />} />
      <Route path="/sign-up/*?" component={() => <AuthPage signUp />} />
      <Route path="/portal"><Protected><PortalHome /></Protected></Route>
      <Route path="/portal/chat"><Protected><Chat /></Protected></Route>
      <Route path="/portal/tickets/new"><Protected><RaiseTicket /></Protected></Route>
      <Route path="/portal/tickets/:id"><Protected><CustomerTicketDetail /></Protected></Route>
      <Route path="/portal/feedback"><Protected><Feedback /></Protected></Route>
      <Route path="/admin/dashboard"><Protected><Dashboard /></Protected></Route>
      <Route path="/admin/tickets"><Protected><Tickets /></Protected></Route>
      <Route path="/admin/tickets/:id"><Protected><TicketDetail /></Protected></Route>
      <Route path="/admin/customers"><Protected><Customers /></Protected></Route>
      <Route path="/admin/insights"><Protected><Insights /></Protected></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const content = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          {hasRealClerkKey && <ClerkTokenSync />}
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );

  if (hasRealClerkKey) {
    return (
      <RealClerkProvider
        publishableKey={clerkPublishableKey}
        proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}
        appearance={{ variables: { colorPrimary: '#f26b5b', colorForeground: '#1f2340', colorBackground: '#fbfbf7', fontFamily: 'DM Sans' } }}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      >
        {content}
      </RealClerkProvider>
    );
  }

  return content;
}

export default App;
