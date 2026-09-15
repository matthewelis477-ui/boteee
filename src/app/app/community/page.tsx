"use client";

import { api } from "@/lib/api";
import { btnPrimary } from "@/components/ui";
import { useLocale } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";

export default function CommunityPage() {
  const { c, locale } = useLocale();
  const [pick, setPick] = useState<number | null>(null);
  const [result, setResult] = useState<string>("");
  const [quiz, setQuiz] = useState<{ q: string; options: string[]; answer: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ name: string; points: number; why: string }[]>([]);
  const [vote, setVote] = useState("BTC");
  const [votes, setVotes] = useState<{ coin: string; count: number }[]>([]);
  const [voteMsg, setVoteMsg] = useState("");

  async function load() {
    const d = await api<{
      quiz: { q: string; options: string[]; answer: number };
      leaderboard: { name: string; points: number; why: string }[];
      votes?: { coin: string; count: number }[];
      myVote?: string | null;
    }>(`/api/community?locale=${locale}`);
    setQuiz(d.quiz);
    setLeaderboard(d.leaderboard);
    setVotes(d.votes || []);
    if (d.myVote) setVote(d.myVote);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [locale]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{c.community.title}</h1>
        <p className="mt-2 text-[var(--muted)]">{c.community.subtitle}</p>
      </div>
      <div className="panel p-5">
        <h2 className="font-medium">{c.community.leaderboard}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {leaderboard.map((r) => (
            <li key={r.name + r.points}>
              {r.name} · {r.points} pts · {r.why}
            </li>
          ))}
        </ul>
      </div>
      <div className="panel p-5">
        <h2 className="font-medium">{c.community.quiz}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Rotates daily · risk discipline</p>
        <p className="mt-2">{quiz?.q}</p>
        <div className="mt-3 grid gap-2">
          {(quiz?.options || []).map((o, i) => (
            <button
              key={o}
              className="rounded-xl border border-white/10 px-3 py-2 text-left text-sm hover:bg-white/5"
              onClick={async () => {
                setPick(i);
                try {
                  const d = await api<{ correct: boolean; points: number }>("/api/community", {
                    method: "POST",
                    body: JSON.stringify({ pick: i, locale }),
                  });
                  setResult(d.correct ? `Correct (+${d.points})` : `Not quite (+${d.points} for trying)`);
                  await load();
                } catch {
                  setResult(pick === quiz?.answer ? "Correct." : "Not quite.");
                }
              }}
            >
              {o}
            </button>
          ))}
        </div>
        {result ? <p className="mt-3 text-sm text-[var(--accent)]">{result}</p> : null}
      </div>
      <div className="panel p-5">
        <h2 className="font-medium">Community watch vote</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Discussion only — not a trade signal.</p>
        <div className="mt-2 flex gap-2">
          {["BTC", "ETH", "SOL", "BNB"].map((coin) => (
            <button key={coin} className={`chip ${vote === coin ? "text-emerald-200" : ""}`} onClick={() => setVote(coin)}>
              {coin}
              {votes.find((v) => v.coin === coin) ? ` · ${votes.find((v) => v.coin === coin)!.count}` : ""}
            </button>
          ))}
        </div>
        <button
          className={`${btnPrimary} mt-4`}
          onClick={async () => {
            try {
              const d = await api<{ votes: { coin: string; count: number }[] }>("/api/community", {
                method: "POST",
                body: JSON.stringify({ vote }),
              });
              setVotes(d.votes || []);
              setVoteMsg(`Saved vote: ${vote}`);
            } catch (e) {
              setVoteMsg(e instanceof Error ? e.message : "Vote failed");
            }
          }}
        >
          Cast vote
        </button>
        {voteMsg ? <p className="mt-2 text-sm text-[var(--accent)]">{voteMsg}</p> : null}
      </div>
    </div>
  );
}
