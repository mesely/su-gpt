import { motion } from 'framer-motion'
import { GlassBadge } from '@/components/ui/GlassBadge'
import { Course } from '@/lib/api'

interface CourseCardProps {
  course: Course
  index?: number
}

function categoryBadge(c: Course['categories']) {
  if (c.isCore) return <GlassBadge label="Core" variant="su" />
  if (c.isArea) return <GlassBadge label="Area" variant="warning" />
  if (c.isBasicScience) return <GlassBadge label="BS" variant="success" />
  return <GlassBadge label="Serbest" variant="neutral" />
}

export function CourseCard({ course, index = 0 }: CourseCardProps) {
  return (
    <motion.div
      className="glass glass-hover rounded-2xl p-3 flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-bold text-su-300 text-sm">{course.fullCode}</span>
        <span className="text-xs text-white/50">{course.ects} ECTS</span>
      </div>
      <p className="text-xs text-white/80 leading-snug line-clamp-2">{course.name}</p>
      <div className="flex items-center gap-1 flex-wrap mt-0.5">
        {categoryBadge(course.categories)}
        {course.instructors[0] && (
          <span className="text-xs text-white/40">{course.instructors[0]}</span>
        )}
      </div>
    </motion.div>
  )
}
