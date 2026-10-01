// Step-by-step questions shown when the AI needs more details (from AMIGO AI).
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClarificationQuestion } from "@/shared";

type AnswerValue = string | string[];

const optionClass = (selected: boolean) =>
  `w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all ${
    selected
      ? "border-brand bg-brand-soft ring-1 ring-brand"
      : "border-border hover:border-brand/50 hover:bg-muted/50"
  }`;

export default function AIAgentQuestions({
  questionList,
  onComplete
}: {
  questionList: ClarificationQuestion[];
  onComplete: (answers: Record<string, AnswerValue>) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    {}
  );

  const question = questionList[currentIndex];
  const answer = answers[question.id] || "";
  const textAnswer = typeof answer === "string" ? answer : "";
  const multiAnswer = Array.isArray(answer) ? answer : [];
  const hasAnswer = Array.isArray(answer)
    ? answer.length > 0
    : answer.trim().length > 0;
  const isLast = currentIndex === questionList.length - 1;
  const isMulti = question.type === "multi_select";
  const showOptions = question.type !== "text" && question.options.length > 0;

  const setAnswer = (value: AnswerValue) =>
    setAnswers((prev) => ({ ...prev, [question.id]: value }));

  const toggleOption = (option: string) => {
    const selected = multiAnswer.includes(option)
      ? multiAnswer.filter((o) => o !== option)
      : [...multiAnswer, option];
    setAnswer(selected);
  };

  // In multi-select, the typed custom answer is one of the selected values.
  const setMultiCustom = (value: string) => {
    const previous = customAnswers[question.id];
    setCustomAnswers((prev) => ({ ...prev, [question.id]: value }));
    const others = previous
      ? multiAnswer.filter((o) => o !== previous)
      : multiAnswer;
    setAnswer(value.trim() ? [...others, value] : others);
  };

  const next = () => {
    if (!hasAnswer) return;
    if (isLast) onComplete(answers);
    else setCurrentIndex((i) => i + 1);
  };

  const enterToNext = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && hasAnswer) next();
  };

  return (
    <div className="mx-auto mt-4 w-full max-w-xl">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Question {currentIndex + 1} of {questionList.length}
          </span>
          <span className="text-sm font-medium">
            {Math.round(((currentIndex + 1) / questionList.length) * 100)}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-brand transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / questionList.length) * 100}%`
            }}
          />
        </div>
      </div>

      <div className="min-h-[260px]">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Help me understand your request
        </p>
        <h2 className="mb-6 text-xl font-semibold">{question.question}</h2>

        {!showOptions && (
          <Input
            value={textAnswer}
            placeholder="Enter your answer"
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={enterToNext}
            className="h-12"
          />
        )}

        {showOptions && (
          <div className="space-y-2">
            {question.options.map((option) => {
              const selected = isMulti
                ? multiAnswer.includes(option)
                : textAnswer === option && !customMode[question.id];
              return (
                <button
                  key={option}
                  type="button"
                  className={optionClass(selected)}
                  onClick={() => {
                    if (isMulti) return toggleOption(option);
                    setCustomMode((prev) => ({
                      ...prev,
                      [question.id]: false
                    }));
                    setAnswer(option);
                  }}
                >
                  <span className="text-sm font-medium">{option}</span>
                  <Tick selected={selected} round={!isMulti} />
                </button>
              );
            })}

            {question.allowCustom && (
              <>
                <button
                  type="button"
                  className={optionClass(!!customMode[question.id])}
                  onClick={() => {
                    const on = !customMode[question.id];
                    setCustomMode((prev) => ({
                      ...prev,
                      [question.id]: isMulti ? on : true
                    }));
                    if (isMulti && !on) setMultiCustom("");
                    if (!isMulti) setAnswer("");
                  }}
                >
                  <span className="text-sm font-medium">Other / Custom</span>
                  <Tick selected={!!customMode[question.id]} round={!isMulti} />
                </button>
                {customMode[question.id] && (
                  <Input
                    className="mt-3 h-12"
                    placeholder="Enter custom answer"
                    value={
                      isMulti ? customAnswers[question.id] || "" : textAnswer
                    }
                    onChange={(e) =>
                      isMulti
                        ? setMultiCustom(e.target.value)
                        : setAnswer(e.target.value)
                    }
                    onKeyDown={enterToNext}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t pt-5">
        <Button
          variant="ghost"
          onClick={() => setCurrentIndex((i) => i - 1)}
          disabled={currentIndex === 0}
          className="gap-2"
        >
          <ArrowLeft className="size-4" /> Previous
        </Button>
        <Button onClick={next} disabled={!hasAnswer} className="gap-2">
          {isLast ? (
            <>
              Continue <Check className="size-4" />
            </>
          ) : (
            <>
              Next <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Tick({ selected, round }: { selected: boolean; round: boolean }) {
  if (round) {
    return selected ? (
      <div className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
        <Check className="size-3" />
      </div>
    ) : null;
  }
  return (
    <div
      className={`flex size-5 items-center justify-center rounded border transition-colors ${
        selected
          ? "border-brand bg-brand text-brand-foreground"
          : "border-muted-foreground/40"
      }`}
    >
      {selected && <Check className="size-3" />}
    </div>
  );
}
