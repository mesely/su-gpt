'use client'
import { GlassCard } from '@/components/ui/GlassCard'
import { CourseCard } from './CourseCard'
import { Course } from '@/lib/api'

interface Semester {
  number: number
  courses: Course[]
  totalEcts: number
}

interface SemesterTableProps {
  semesters: Semester[]
}

export function SemesterTable({ semesters }: SemesterTableProps) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {semesters.map((sem) => (
          <div key={sem.number} className="w-52 flex flex-col gap-2">
            {/* Header */}
            <div className="glass rounded-2xl px-3 py-2 flex justify-between items-center">
              <span className="text-sm font-semibold text-white">Dönem {sem.number}</span>
              <span className="text-xs text-su-300 font-medium">{sem.totalEcts} ECTS</span>
            </div>

            {/* ECTS progress bar */}
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-su-500 to-su-300 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((sem.totalEcts / 30) * 100, 100)}%` }}
              />
            </div>

            {/* Courses */}
            <div className="flex flex-col gap-2">
              {sem.courses.map((c, i) => (
                <CourseCard key={c.fullCode} course={c} index={i} />
              ))}
              {sem.courses.length === 0 && (
                <div className="glass rounded-2xl p-4 flex items-center justify-center">
                  <span className="text-white/30 text-xs">Ders yok</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
