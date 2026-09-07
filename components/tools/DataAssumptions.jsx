import { getDataset } from '../../lib/datasetManifest.mjs';

export default function DataAssumptions({ datasetId, toolVersion }) {
  const data = getDataset(datasetId);
  return <details className="tool-data-assumptions" style={{marginTop:18,padding:'14px 16px',border:'1px solid var(--edge)',borderRadius:'var(--radius-md)',color:'var(--parchment-dim)',fontSize:11}}>
    <summary>Data &amp; assumptions</summary>
    <dl>
      <div><dt>Dataset</dt><dd>{data.name}</dd></div>
      <div><dt>Status</dt><dd>{data.status}</dd></div>
      <div><dt>Last verified</dt><dd>{data.lastVerified || 'Verification date needed'}</dd></div>
      <div><dt>Source</dt><dd>{data.source}</dd></div>
      <div><dt>Tool version</dt><dd>{toolVersion}</dd></div>
    </dl>
    <p>{data.limitations}</p>
    {data.assumptions.length > 0 && <><h3>Assumptions</h3><ul>{data.assumptions.map(item => <li key={item}>{item}</li>)}</ul></>}
  </details>;
}
