interface RestartApplyModalProps {
  skinName: string;
  appName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestartApplyModal({
  skinName,
  appName,
  onConfirm,
  onCancel,
}: RestartApplyModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">需要重启 {appName}</div>
        <div className="modal-body">
          「{skinName}」需要 {appName} 开启皮肤通道才能注入。<br />
          确认后 {appName} 将自动重启（未保存的输入可能丢失），重启后皮肤立即生效。
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>重启并应用</button>
        </div>
      </div>
    </div>
  );
}
