// 화면 이동 중 (모바일에서 누르자마자 바로 보이게): 사이드바·탭바는 그대로 두고 본문 자리만 회색 뼈대로 채운다.
// 이 파일이 있으면 Next 가 링크를 미리 받아 둘 때 이 뼈대까지 받아 두어, 눌렀을 때 곧바로 넘어간다.
export default function Loading() {
  const bar = "animate-pulse rounded-control bg-line/70";
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="px-4 pb-8 pt-5 md:px-10 md:pt-8">
      <div className={`${bar} h-7 w-40`} />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="surface flex flex-col gap-3 rounded-card p-4 md:p-5">
            <div className={`${bar} h-3.5 w-16`} />
            <div className={`${bar} h-7 w-12`} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-4 md:mt-6 md:gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="surface flex flex-col gap-3 rounded-card p-5 md:p-6">
            <div className={`${bar} h-5 w-32`} />
            <div className={`${bar} h-4 w-full`} />
            <div className={`${bar} h-4 w-5/6`} />
            <div className={`${bar} h-4 w-2/3`} />
          </div>
        ))}
      </div>
    </div>
  );
}
