import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface AnimatedTitleProps {
  text: string;
  className?: string;
}

/**
 * Выразительная посимвольная и пословная 3D-анимация заголовка
 * при каждом открытии вкладки + живой перелив акцентных слов
 */
export const AnimatedTitle: React.FC<AnimatedTitleProps> = ({
  text,
  className = '',
}) => {
  const words = text.split(' ');
  let charGlobalIndex = 0;

  return (
    <h1
      className={`flex flex-wrap gap-x-[0.3em] gap-y-1.5 ${className}`}
      style={{ perspective: '800px' }}
    >
      {words.map((word, wordIdx) => {
        const isHighlightWord = wordIdx >= Math.max(1, words.length - 2);
        const chars = Array.from(word);

        return (
          <span key={`${word}-${wordIdx}`} className="inline-flex whitespace-nowrap">
            {chars.map((char, cIdx) => {
              const delay = 0.06 + charGlobalIndex * 0.026;
              charGlobalIndex += 1;

              return (
                <motion.span
                  key={`${char}-${cIdx}`}
                  initial={{
                    opacity: 0,
                    y: 28,
                    rotateX: -70,
                    scale: 0.8,
                    filter: 'blur(8px)',
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    rotateX: 0,
                    scale: 1,
                    filter: 'blur(0px)',
                  }}
                  transition={{
                    delay,
                    type: 'spring',
                    stiffness: 220,
                    damping: 18,
                  }}
                  className={`inline-block origin-bottom ${
                    isHighlightWord ? 'animated-gradient-word' : ''
                  }`}
                >
                  {char}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </h1>
  );
};

/**
 * Эффект живой печати (Typewriter) для подзаголовка вкладки
 */
export const TypewriterSubtitle: React.FC<{ text: string }> = ({ text }) => {
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    setVisibleChars(0);
    const total = text.length;
    const step = Math.max(1, Math.ceil(total / 48));
    const timer = setInterval(() => {
      setVisibleChars((prev) => {
        if (prev + step >= total) {
          clearInterval(timer);
          return total;
        }
        return prev + step;
      });
    }, 22);

    return () => clearInterval(timer);
  }, [text]);

  const isTyping = visibleChars < text.length;

  return (
    <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
      <span>{text.slice(0, visibleChars)}</span>
      {isTyping && (
        <span
          className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
          style={{ backgroundColor: 'var(--accent-main)' }}
        />
      )}
    </p>
  );
};

/**
 * Плавный счётчик чисел при входе на вкладку
 */
export const AnimatedCount: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
}> = ({ value, prefix = '', suffix = '' }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 750;
    let rafId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return (
    <span className="font-mono tabular-nums">
      {prefix}
      {displayValue.toLocaleString('ru-RU')}
      {suffix}
    </span>
  );
};

export interface HeroMetricItem {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  highlight?: boolean;
}

interface TabHeroHeaderProps {
  kicker: string;
  title: string;
  subtitle: string;
  metrics?: HeroMetricItem[];
  actions?: React.ReactNode;
}

/**
 * Лаконичная шапка вкладки с посимвольной 3D-анимацией заголовка,
 * эффектом живой печати подзаголовка и встроенными счётчиками ключевых цифр
 */
export const TabHeroHeader: React.FC<TabHeroHeaderProps> = ({
  kicker,
  title,
  subtitle,
  metrics,
  actions,
}) => {
  return (
    <div className="relative overflow-hidden rounded-3xl theme-surface border p-7 sm:p-9 shadow-xs">
      {/* Мягкое акцентное свечение выбранной палитры */}
      <div
        className="pointer-events-none absolute -top-28 -right-24 w-96 h-96 rounded-full blur-3xl opacity-50"
        style={{ background: 'var(--accent-glow)' }}
      />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider theme-accent-text"
          >
            <span
              className="w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: 'var(--accent-main)' }}
            />
            <span>{kicker}</span>
          </motion.div>

          <AnimatedTitle
            text={title}
            className="text-2xl sm:text-4xl font-extrabold tracking-tight"
          />

          <TypewriterSubtitle text={subtitle} />
        </div>

        {actions && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.35 }}
            className="flex flex-wrap items-center gap-2.5 shrink-0"
          >
            {actions}
          </motion.div>
        )}
      </div>

      {metrics && metrics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          className="relative z-10 mt-6 pt-5 border-t flex flex-wrap items-center gap-8 sm:gap-12"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {metrics.map((m, idx) => (
            <div key={idx} className="space-y-0.5">
              <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {m.label}
              </div>
              <div
                className={`text-xl sm:text-2xl font-extrabold ${
                  m.highlight ? 'theme-accent-text' : ''
                }`}
              >
                <AnimatedCount value={m.value} prefix={m.prefix} suffix={m.suffix} />
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
};
