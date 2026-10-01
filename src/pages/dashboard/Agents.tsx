// Agents page: create a new agent or manage existing ones.
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CreateAgent from "@/components/agents/CreateAgent";
import MyAgents from "@/components/agents/MyAgents";

export default function AgentsPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(
    params.get("tab") === "mine" ? "my-agent" : "create-agent"
  );

  function changeTab(value: string) {
    setTab(value);
    setParams(value === "my-agent" ? { tab: "mine" } : {}, { replace: true });
  }

  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-4xl px-6 pt-16 pb-16">
        <Tabs
          value={tab}
          onValueChange={(v) => changeTab(String(v))}
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="create-agent">Create Agent</TabsTrigger>
            <TabsTrigger value="my-agent">My Agents</TabsTrigger>
          </TabsList>
          <TabsContent value="create-agent">
            <CreateAgent />
          </TabsContent>
          <TabsContent value="my-agent">
            <MyAgents onCreate={() => changeTab("create-agent")} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
