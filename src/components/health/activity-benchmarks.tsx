"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import styles from "./activity-redesign.module.css";

type Benchmark = { id: string; label: string; value: string; context?: string; explanation: string };

export function ActivityBenchmarks({ items }: { items: readonly Benchmark[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return <dl className={`${styles.readingsGrid}${items.length > 4 ? ` ${styles.readingsGridExtended}` : ""}`}>{items.map((item) => {
    const open = openId === item.id;
    return <div className={styles.benchmark} key={item.id}>
      <dt>{item.label}</dt>
      <dd><button type="button" className={styles.benchmarkTrigger} aria-expanded={open} aria-controls={`benchmark-${item.id}`} onClick={() => setOpenId(open ? null : item.id)}>
        <strong>{item.value}</strong>{item.context && <small>{item.context}</small>}<ChevronDown size={15} aria-hidden="true" />
      </button></dd>
      <dd className={styles.benchmarkExplanation} id={`benchmark-${item.id}`} aria-hidden={!open} data-open={open}><span>{item.explanation}</span></dd>
    </div>;
  })}</dl>;
}
