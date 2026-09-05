import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/feedback';

export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-3.5 w-96 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <div className="card mt-5">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonTable rows={6} columns={6} />
      </div>
    </div>
  );
}
