import { Home, OctagonX, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { MissionSummary, PublicTurtle } from "@/lib/types";
import { useConsole } from "@/lib/use-console";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { turtleName } from "@/lib/format";

export function MissionControls({
  turtle,
  mission,
  online,
  compact = false,
}: {
  turtle: PublicTurtle;
  mission?: MissionSummary;
  online: boolean;
  compact?: boolean;
}) {
  const { command, isPending } = useConsole();
  const name = turtleName(turtle);
  if (turtle.role !== "miner") {
    return (
      <span className="mono max-w-[180px] text-[9px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground/80">
        {turtle.role === "lumberjack"
          ? "forestry runtime not built"
          : turtle.role === "hauler"
            ? "hauler runs from deployment tab"
            : turtle.role === "station_builder"
              ? "station builder runs from deployment tab"
              : "assign a role first"}
      </span>
    );
  }
  const state = mission?.state;
  const resumable = state === "paused" || state === "failed" || state === "done" || !mission;
  const startPending = isPending(turtle.id, "start");
  const returnPending = isPending(turtle.id, "return");
  const abortPending = isPending(turtle.id, "abort");

  const start = async () => {
    const ok = await command(turtle.id, "start", name);
    if (ok && mission?.state === "paused") toast.message("Resume dispatched", { description: name });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {resumable ? (
        <Button
          size={compact ? "xs" : "sm"}
          disabled={!online || startPending}
          onClick={() => void start()}
          title={online ? "Create or resume the mission" : "Turtle is offline"}
        >
          {startPending ? (
            <Spinner data-icon="inline-start" />
          ) : state === "paused" ? (
            <RotateCcw data-icon="inline-start" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {state === "paused" ? "Resume" : state === "failed" ? "Restart" : "Start"}
        </Button>
      ) : (
        <Button
          size={compact ? "xs" : "sm"}
          variant="outline"
          disabled={!online || returnPending}
          onClick={() => void command(turtle.id, "return", name)}
          title="Return to the dock and pause the mission"
        >
          {returnPending ? <Spinner data-icon="inline-start" /> : <Home data-icon="inline-start" />}
          Recall
        </Button>
      )}

      {mission && (state === "active" || state === "offered" || state === "paused") ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size={compact ? "xs" : "sm"}
              variant="ghost"
              disabled={!online || abortPending}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <OctagonX data-icon="inline-start" />
              Abort
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <OctagonX />
              </AlertDialogMedia>
              <AlertDialogTitle>Abort this mission?</AlertDialogTitle>
              <AlertDialogDescription>
                {name} will still walk home and park at the dock. The mission is marked failed on
                the console and cannot be resumed. Start a fresh mission afterwards.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep running</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={abortPending}
                onClick={() => void command(turtle.id, "abort", name)}
              >
                {abortPending ? <Spinner data-icon="inline-start" /> : null}
                Abort mission
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
