/** Plotly wrapper with CSV and PNG export buttons. Plotly is loaded lazily with the charts panel. */
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import { useRef, useState, type ReactNode } from 'react';
import { toCSV, type Table } from '../../physics/curves';
import { download } from '../download';

const PlotlyPlot = createPlotlyComponent(Plotly);


export function Chart({
  id, title, data, layout, table, note, controls,
}: { id: string; title: string; data: Data[]; layout: Partial<Layout>; table: Table; note?: ReactNode; controls?: ReactNode }) {
  const gd = useRef<HTMLElement | null>(null);
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        {controls}
        <span className="chart-actions">
          <button className={showTable ? 'active' : ''} title="Show the plotted numbers as a table (SI units)" onClick={() => setShowTable(!showTable)}>
            Table
          </button>
          <button title="Download the plotted data as CSV (SI units, unit in each header)" onClick={() => download(`${id}.csv`, new Blob([toCSV(table)], { type: 'text/csv' }))}>
            CSV
          </button>
          <button
            title="Download as PNG"
            onClick={() => gd.current && Plotly.downloadImage(gd.current, { format: 'png', filename: id, width: 1400, height: 700, scale: 2 })}
          >
            PNG
          </button>
        </span>
      </div>
      {note && <div className="chart-note">{note}</div>}
      {showTable ? (
        <DataTable table={table} />
      ) : (
      <PlotlyPlot
        className="chart-plot"
        data={data}
        layout={layout}
        config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'], toImageButtonOptions: { filename: id, scale: 2 } }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        onInitialized={(_f, el) => (gd.current = el)}
        onUpdate={(_f, el) => (gd.current = el)}
      />
      )}
    </div>
  );
}

function DataTable({ table }: { table: Table }) {
  const f = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(5)) : '—');
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.key}>
                {c.label}
                {c.unit && <span className="unit"> [{c.unit}]</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((c) => (
                <td key={c.key}>{f(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
