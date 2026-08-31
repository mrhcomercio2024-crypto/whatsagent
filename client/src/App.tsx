import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AgentProvider } from "./contexts/AgentContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Simulator from "./pages/Simulator";
import Brain from "./pages/Brain";
import Steps from "./pages/Steps";
import Knowledge from "./pages/Knowledge";
import Media from "./pages/Media";
import Objections from "./pages/Objections";
import Followups from "./pages/Followups";
import Whatsapp from "./pages/Whatsapp";
import Templates from "./pages/Templates";
import Ops from "./pages/Ops";
import Agents from "./pages/Agents";
import Settings from "./pages/Settings";
import Costs from "./pages/Costs";
import ExternalEvents from "./pages/ExternalEvents";
import Retries from "./pages/Retries";
import Live from "./pages/Live";
import Login from "./pages/Login";
import AdminUsers from "./pages/AdminUsers";
import PublicSimulatorChat from "./pages/PublicSimulatorChat";
import PublicSimulatorAdmin from "./pages/PublicSimulatorAdmin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/simulador/:slug" component={PublicSimulatorChat} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/simulador-whatsapp" component={PublicSimulatorAdmin} />
      <Route path="/dashboard" component={Dashboard} />
      {/* /chat, /inbox e /live convergem para a tela unificada (Live) */}
      <Route path="/chat" component={Live} />
      <Route path="/inbox" component={Live} />
      <Route path="/leads" component={Leads} />
      <Route path="/simulator" component={Simulator} />
      <Route path="/brain" component={Brain} />
      <Route path="/steps" component={Steps} />
      <Route path="/knowledge" component={Knowledge} />
      <Route path="/media" component={Media} />
      <Route path="/objections" component={Objections} />
      <Route path="/followups" component={Followups} />
      <Route path="/whatsapp" component={Whatsapp} />
      <Route path="/templates" component={Templates} />
      <Route path="/ops" component={Ops} />
      <Route path="/agents" component={Agents} />
      <Route path="/costs" component={Costs} />
      <Route path="/external-events" component={ExternalEvents} />
      <Route path="/retries" component={Retries} />
      <Route path="/live" component={Live} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AgentProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AgentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
