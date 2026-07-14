// @feature 个人主页抽屉 | Profile Drawer | ProfileDrawer
import { motion } from 'framer-motion';
import ProfileExperience from './ProfileExperience';

export default function ProfileDrawer({ reserveMobileNavigation = false, onClose, ...profileProps }) {
  return (
    <div className="fixed inset-0 z-[2500] pointer-events-none">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
        style={{ right: 'max(0px, env(safe-area-inset-right))' }}
        className={`ios-panel absolute top-0 h-full w-full overflow-hidden border-l-0 bg-[var(--color-warm-paper)] pointer-events-auto md:w-[28rem] ${reserveMobileNavigation ? 'bliver-destination-surface' : ''}`}
      >
        <ProfileExperience {...profileProps} onClose={onClose} />
      </motion.div>
    </div>
  );
}
