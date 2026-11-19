export function RecordingControls({
  isPaused,
  isRecording,
  onFinish,
  onPause,
  onStart,
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isRecording}
        onClick={onStart}
        type="button"
      >
        <i className="fa-solid fa-play" /> 开始
      </button>
      <button
        className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-white shadow transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
          isPaused
            ? 'bg-emerald-600 hover:bg-emerald-500'
            : 'bg-amber-600 hover:bg-amber-500'
        }`}
        disabled={!isRecording}
        onClick={onPause}
        type="button"
      >
        <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`} />
        {isPaused ? '继续' : '暂停'}
      </button>
      <button
        className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!isRecording}
        onClick={onFinish}
        type="button"
      >
        <i className="fa-solid fa-stop" /> 结束
      </button>
    </div>
  );
}

