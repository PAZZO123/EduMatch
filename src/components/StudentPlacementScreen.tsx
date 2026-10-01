import React from 'react';
import { StudentPlacementWorkflow } from './StudentPlacementWorkflow';

interface StudentPlacementScreenProps {
  initialStudentId?: string;
  onRefreshProposals: () => void;
}

export const StudentPlacementScreen: React.FC<StudentPlacementScreenProps> = ({
  initialStudentId,
  onRefreshProposals
}) => {
  return (
    <StudentPlacementWorkflow
      initialStudentId={initialStudentId}
      onRefreshProposals={onRefreshProposals}
    />
  );
};
