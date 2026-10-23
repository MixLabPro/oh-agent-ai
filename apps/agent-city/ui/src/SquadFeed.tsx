import { useMemo } from "react";
import { cityText, useCityLanguage } from "./i18n";
import {
  envelopeAssetRef, envelopeSummary, isWriteKind, visibleFeed,
  type KindFilter, type SquadEnvelope, type SquadKind, SQUAD_KINDS, KILL_FEED_MS,
} from "./engine/squadEvents";

const KIND_LABEL: Record<SquadKind, string> = {
  chat: "聊天",
  claim: "占用",
  release: "释放",
  preview: "预览",
  reject: "拒绝",
  set: "写入",
  reset: "重置",
  observe: "观察",
};

type Props = {
  items: SquadEnvelope[];
  filter: KindFilter;
  onFilter(next: KindFilter): void;
  onFocus(assetRef: string): void;
  nowMs: number;
  open: boolean;
  onOpen(open: boolean): void;
};

export function SquadFeed({ items, filter, onFilter, onFocus, nowMs, open, onOpen }: Props) {
  const language = useCityLanguage();
  const visible = useMemo(() => visibleFeed(items, filter), [items, filter]);
  const kill = useMemo(
    () => items.filter((item) => isWriteKind(item.kind) && filter[item.kind] && (nowMs - item.ts * 1000) < KILL_FEED_MS).slice(0, 4),
    [items, filter, nowMs],
  );
  return (
    <>
      {kill.length > 0 && <ol className="city-squad-kill" aria-label={cityText("小队快讯", language)}>
        {kill.map((item) => (
          <li key={item.id} data-kind={item.kind}>
            <strong>{item.agent_name}</strong>
            <span>{KIND_LABEL[item.kind]}</span>
            {envelopeAssetRef(item) && <button type="button" onClick={() => onFocus(envelopeAssetRef(item)!)}>{cityText("定位", language)}</button>}
          </li>
        ))}
      </ol>}
      <aside className={open ? "city-squad-feed is-open" : "city-squad-feed"} aria-label={cityText("小队频道", language)}>
        <button type="button" className="city-squad-toggle" aria-expanded={open} onClick={() => onOpen(!open)}>
          {cityText(open ? "收起小队" : "小队频道", language)}
        </button>
        {open && <>
          <p className="city-squad-hint">{cityText("多 Agent 施工频道。写入由 City MCP 广播；Agent 只发聊天/占用/释放。", language)}</p>
          <fieldset className="city-squad-filter">
            <legend>{cityText("显示种类", language)}</legend>
            {SQUAD_KINDS.map((kind) => (
              <label key={kind}>
                <input type="checkbox" checked={filter[kind]} onChange={(event) => onFilter({ ...filter, [kind]: event.target.checked })} />
                {cityText(KIND_LABEL[kind], language)}
              </label>
            ))}
          </fieldset>
          {visible.length === 0 ? <p>{cityText("还没有符合筛选的事件。", language)}</p> : <ol>
            {visible.map((item) => {
              const asset = envelopeAssetRef(item);
              return <li key={item.id} data-kind={item.kind}>
                <span className="city-squad-meta">{item.agent_name} · {cityText(KIND_LABEL[item.kind], language)}</span>
                <span className="city-squad-body">{envelopeSummary(item)}</span>
                {asset && <button type="button" onClick={() => onFocus(asset)}>{cityText("定位建筑", language)}</button>}
              </li>;
            })}
          </ol>}
        </>}
      </aside>
    </>
  );
}
