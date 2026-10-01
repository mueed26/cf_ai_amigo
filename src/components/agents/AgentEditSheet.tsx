// Edit an agent: look, instructions, schedule, skills, tools and output format.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2, Plus, Shuffle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/workspace-context";
import { agentImage, toastError, toastSuccess } from "@/lib/format";
import {
  TOOL_CATALOG,
  type AgentConfig,
  type AgentSchedule,
  type AgentSummary,
  type ToolSlug
} from "@/shared";

type Frequency = "hourly" | "daily" | "weekly" | "monthly";
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

// Simple schedule form values, turned into a cron and label on save.
type ScheduleForm = {
  type: AgentSchedule["type"];
  frequency: Frequency;
  time: string;
  weekday: string;
  runAt: string;
};

function readSchedule(s: AgentSchedule): ScheduleForm {
  const form: ScheduleForm = {
    type: s.type,
    frequency: "daily",
    time: "09:00",
    weekday: "1",
    runAt: s.runAt ?? ""
  };
  const parts = s.cron?.trim().split(/\s+/);
  if (parts?.length === 5) {
    const [m, h, dom, , dow] = parts;
    const pad = (n: string) => n.padStart(2, "0");
    if (/^\d+$/.test(m))
      form.time = /^\d+$/.test(h) ? `${pad(h)}:${pad(m)}` : `00:${pad(m)}`;
    if (h === "*") form.frequency = "hourly";
    else if (dom !== "*") form.frequency = "monthly";
    else if (dow !== "*" && /^\d$/.test(dow)) {
      form.frequency = "weekly";
      form.weekday = dow;
    }
  }
  return form;
}

function writeSchedule(
  f: ScheduleForm,
  previous: AgentSchedule
): AgentSchedule {
  if (f.type === "manual") return { type: "manual", label: "Manual" };
  if (f.type === "once") {
    return {
      type: "once",
      runAt: f.runAt,
      label: `Once on ${f.runAt.replace("T", " at ")}`
    };
  }
  const [h, m] = f.time.split(":").map(Number);
  const cron = {
    hourly: `${m} * * * *`,
    daily: `${m} ${h} * * *`,
    weekly: `${m} ${h} * * ${f.weekday}`,
    monthly: `${m} ${h} 1 * *`
  }[f.frequency];
  // Keep the AI's own cron (e.g. "weekdays") if the form wasn't changed.
  if (
    previous.cron &&
    readScheduleKey(readSchedule(previous)) === readScheduleKey(f)
  )
    return previous;
  const label = {
    hourly: `Every hour at :${String(m).padStart(2, "0")}`,
    daily: `Every day at ${f.time}`,
    weekly: `Every ${WEEKDAYS[Number(f.weekday)]} at ${f.time}`,
    monthly: `Monthly on the 1st at ${f.time}`
  }[f.frequency];
  return { type: "recurring", cron, label };
}

const readScheduleKey = (f: ScheduleForm) =>
  `${f.type}|${f.frequency}|${f.time}|${f.weekday}`;

export default function AgentEditSheet({
  agent,
  onClose
}: {
  agent: AgentSummary | null;
  onClose: () => void;
}) {
  const { workspace, state } = useWorkspace();
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [original, setOriginal] = useState<AgentConfig | null>(null);
  const [schedule, setSchedule] = useState<ScheduleForm | null>(null);
  const [skill, setSkill] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(null);
    if (!agent) return;
    workspace.stub
      .getAgentConfig(agent.id)
      .then((config) => {
        const c = config as AgentConfig;
        setDraft(c);
        setOriginal(c);
        setSchedule(readSchedule(c.schedule));
      })
      .catch((e) => {
        toastError(e, "Couldn't load the agent");
        onClose();
      });
  }, [agent?.id]);

  const update = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const toggleTool = (slug: ToolSlug) =>
    draft &&
    update(
      "tools",
      draft.tools.includes(slug)
        ? draft.tools.filter((t) => t !== slug)
        : [...draft.tools, slug]
    );

  const addSkill = () => {
    const value = skill.trim();
    if (!draft || !value) return;
    if (!draft.skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      update("skills", [...draft.skills, value]);
    }
    setSkill("");
  };

  async function save() {
    if (!agent || !draft || !schedule || !original) return;
    if (schedule.type === "once" && !schedule.runAt) {
      toastError("Pick a date and time for the one-time run.", "Missing date");
      return;
    }
    setSaving(true);
    try {
      await workspace.stub.updateAgent(agent.id, {
        ...draft,
        schedule: writeSchedule(schedule, original.schedule)
      });
      toastSuccess("Agent updated!");
      onClose();
    } catch (e) {
      toastError(e, "Couldn't save the agent");
    } finally {
      setSaving(false);
    }
  }

  const connections = state?.connections ?? [];

  return (
    <Sheet open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src={agentImage(draft?.image, agent?.name ?? "agent")}
              alt=""
              className="size-10 rounded-xl border bg-muted p-1"
            />
            <div>
              <SheetTitle>Edit Agent</SheetTitle>
              <SheetDescription>
                Update how this agent looks, works and runs.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {!draft || !schedule ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading agent…
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-6 p-5">
              <section className="flex items-center gap-4 rounded-2xl border bg-muted/30 p-4">
                <img
                  src={agentImage(draft.image, draft.name)}
                  alt=""
                  className="size-20 rounded-2xl border bg-white object-cover p-2"
                />
                <div className="space-y-2">
                  <div>
                    <p className="font-medium">Agent Image</p>
                    <p className="text-xs text-muted-foreground">
                      Shuffle to generate a new look
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(
                        "image",
                        `https://api.dicebear.com/9.x/bottts/svg?seed=${crypto.randomUUID()}`
                      )
                    }
                  >
                    <Shuffle className="size-4" /> Shuffle Image
                  </Button>
                </div>
              </section>

              <section className="space-y-2">
                <Label htmlFor="agent-name">Agent Name</Label>
                <Input
                  id="agent-name"
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </section>

              <section className="space-y-2">
                <Label htmlFor="agent-description">Description</Label>
                <Input
                  id="agent-description"
                  value={draft.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </section>

              <section className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-objective">Objective</Label>
                  <Textarea
                    id="agent-objective"
                    value={draft.objective}
                    onChange={(e) => update("objective", e.target.value)}
                    placeholder="What should this agent do each run?"
                    className="min-h-24 resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-instructions">Instructions</Label>
                  <Textarea
                    id="agent-instructions"
                    value={draft.instructions}
                    onChange={(e) => update("instructions", e.target.value)}
                    className="min-h-32 resize-y"
                  />
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border p-4">
                <div>
                  <h3 className="font-medium">Schedule</h3>
                  <p className="text-xs text-muted-foreground">
                    Choose when and how often this agent runs (
                    {agent?.scheduleLabel}).
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Run Type</Label>
                    <Select
                      value={schedule.type}
                      onValueChange={(v) =>
                        setSchedule({
                          ...schedule,
                          type: v as ScheduleForm["type"]
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="once">Once</SelectItem>
                        <SelectItem value="recurring">Recurring</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {schedule.type === "once" && (
                    <div className="space-y-2">
                      <Label htmlFor="run-at">Date & time</Label>
                      <Input
                        id="run-at"
                        type="datetime-local"
                        value={schedule.runAt}
                        onChange={(e) =>
                          setSchedule({ ...schedule, runAt: e.target.value })
                        }
                      />
                    </div>
                  )}

                  {schedule.type === "recurring" && (
                    <>
                      <div className="space-y-2">
                        <Label>Frequency</Label>
                        <Select
                          value={schedule.frequency}
                          onValueChange={(v) =>
                            setSchedule({
                              ...schedule,
                              frequency: v as Frequency
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Hourly</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="schedule-time">Time</Label>
                        <Input
                          id="schedule-time"
                          type="time"
                          value={schedule.time}
                          onChange={(e) =>
                            setSchedule({ ...schedule, time: e.target.value })
                          }
                        />
                      </div>
                      {schedule.frequency === "weekly" && (
                        <div className="space-y-2">
                          <Label>Day</Label>
                          <Select
                            value={schedule.weekday}
                            onValueChange={(v) =>
                              setSchedule({ ...schedule, weekday: String(v) })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WEEKDAYS.map((d, i) => (
                                <SelectItem key={d} value={String(i)}>
                                  {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="font-medium">Skills</h3>
                  <p className="text-xs text-muted-foreground">
                    Short labels describing what this agent does.
                  </p>
                </div>
                <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border bg-muted/20 p-2.5">
                  {draft.skills.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="h-7 gap-1.5 px-2.5"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "skills",
                            draft.skills.filter((x) => x !== s)
                          )
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  {draft.skills.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No skills added
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="Add a skill"
                  />
                  <Button type="button" variant="outline" onClick={addSkill}>
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="font-medium">Tools</h3>
                  <p className="text-xs text-muted-foreground">
                    {draft.tools.length} enabled. Apps need to be connected on
                    the{" "}
                    <Link
                      to="/dashboard/integrations"
                      className="text-brand underline"
                      onClick={onClose}
                    >
                      Integrations
                    </Link>{" "}
                    page.
                  </p>
                </div>
                <div className="space-y-2">
                  {TOOL_CATALOG.map((tool) => {
                    const connection = connections.find(
                      (c) => c.id === tool.connection
                    );
                    const ready = !tool.connection || connection?.connected;
                    return (
                      <div
                        key={tool.slug}
                        className="flex items-center justify-between gap-3 rounded-xl border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{tool.name}</p>
                          <p
                            className={`text-xs ${ready ? "text-green-600" : "text-red-500"}`}
                          >
                            {!tool.connection
                              ? "Built-in"
                              : ready
                                ? "Connected"
                                : "Not connected"}
                          </p>
                        </div>
                        <Switch
                          checked={draft.tools.includes(tool.slug)}
                          onCheckedChange={() => toggleTool(tool.slug)}
                          aria-label={`Use ${tool.name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <Label htmlFor="output-format">Output Format</Label>
                <Textarea
                  id="output-format"
                  value={draft.outputFormat}
                  onChange={(e) => update("outputFormat", e.target.value)}
                  className="min-h-24 resize-y"
                />
              </section>
            </div>
          </ScrollArea>
        )}

        <SheetFooter className="border-t p-4">
          <div className="flex w-full justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!draft || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
