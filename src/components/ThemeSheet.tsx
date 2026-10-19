import { useId } from 'react';
import { BACKGROUND_OPTIONS } from '../lib/theme';
import { Icon } from './Icon';
import { Overlay } from './Overlay';

interface ThemeSheetProps {
  value: string;
  onChange(color: string): void;
  onClose(): void;
}

/** 聊天背景顏色（design.md 6.1）：選了就立刻套用，只改變自己看到的畫面 */
export function ThemeSheet({ value, onChange, onClose }: ThemeSheetProps) {
  const id = useId();
  const isPreset = BACKGROUND_OPTIONS.some((o) => o.color.toLowerCase() === value.toLowerCase());
  return (
    <Overlay onClose={onClose} panelClassName="sheet" labelledBy={id}>
      <div className="sheet__grip" aria-hidden="true" />
      <div>
        <h2 className="sheet__title" id={id}>
          聊天背景
        </h2>
        <p className="sheet__lead">只會改變你自己看到的畫面，別人看不到。</p>
      </div>
      <div className="swatches" role="radiogroup" aria-label="背景顏色">
        {BACKGROUND_OPTIONS.map((o) => {
          const selected = o.color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={o.color}
              type="button"
              role="radio"
              aria-checked={selected}
              className="swatch"
              onClick={() => onChange(o.color)}
              data-autofocus={selected ? true : undefined}
            >
              <span className="swatch__chip" style={{ background: o.color }}>
                {selected && <Icon name="check" />}
              </span>
              {o.name}
            </button>
          );
        })}
        <label className="swatch" aria-checked={!isPreset} role="radio">
          <span
            className={isPreset ? 'swatch__chip swatch__chip--custom' : 'swatch__chip'}
            style={isPreset ? undefined : { background: value }}
          >
            <Icon name={isPreset ? 'plus' : 'check'} />
            <input
              type="color"
              value={value}
              aria-label="自訂背景顏色"
              onChange={(e) => onChange(e.target.value)}
            />
          </span>
          自訂
        </label>
      </div>
      <button type="button" className="btn btn--primary" style={{ fontSize: 16 }} onClick={onClose}>
        完成
      </button>
    </Overlay>
  );
}
