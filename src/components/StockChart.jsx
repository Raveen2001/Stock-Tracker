import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/** Yahoo chart timestamps are Unix seconds; format in Asia/Kolkata (IST). */
const IST_DATE_TIME_OPTS = {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

const IST_TIME_ONLY_OPTS = {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

function formatIstDateTime(tsSeconds) {
  if (tsSeconds == null || Number.isNaN(Number(tsSeconds))) return '';
  const d = new Date(Number(tsSeconds) * 1000);
  return `${d.toLocaleString('en-IN', IST_DATE_TIME_OPTS)} IST`;
}

function formatIstTimeOnly(tsSeconds) {
  if (tsSeconds == null || Number.isNaN(Number(tsSeconds))) return '';
  const d = new Date(Number(tsSeconds) * 1000);
  return d.toLocaleString('en-IN', IST_TIME_ONLY_OPTS);
}

export default function StockChart({ data, isPositive }) {
  const color = isPositive ? '#16a34a' : '#dc2626';

  const chartData = useMemo(() => {
    if (!data?.length) return [];
    return data.map((p) => {
      if (p.timestamp != null) {
        return {
          ...p,
          time: formatIstTimeOnly(p.timestamp),
          tooltipTime: formatIstDateTime(p.timestamp),
        };
      }
      return {
        ...p,
        tooltipTime: p.time ?? '',
      };
    });
  }, [data]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-time">
            {payload[0].payload.tooltipTime ?? payload[0].payload.time}
          </p>
          <p className="chart-tooltip-price" style={{ color }}>
            ₹{payload[0].value.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="stock-chart">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 8 }}>
          <defs>
            <linearGradient id={`gradient-${isPositive}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: '#a1a1aa' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            angle={-35}
            textAnchor="end"
            height={52}
            minTickGap={24}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${isPositive})`}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
