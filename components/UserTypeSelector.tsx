
import React from 'react';
import { UserType } from '../types';
import { Card, Logo } from './ui';

interface UserTypeSelectorProps {
  onSelectUserType: (userType: UserType) => void;
}

const userTypes: UserType[] = [
  UserType.STUDENT,
  UserType.FRESHER,
  UserType.EXPERIENCED,
  UserType.SENIOR,
];

const UserTypeCard: React.FC<{ userType: UserType; onClick: () => void }> = ({ userType, onClick }) => {
    const icons: Record<UserType, string> = {
        [UserType.STUDENT]: '🎓',
        [UserType.FRESHER]: '🧑‍💼',
        [UserType.EXPERIENCED]: '👩‍💻',
        [UserType.SENIOR]: '🧑‍🏫',
    };

    return (
        <div
            onClick={onClick}
            className="group bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center cursor-pointer transition-all duration-300 hover:bg-slate-700/70 hover:border-indigo-500 hover:-translate-y-1"
        >
            <div className="text-5xl mb-4">{icons[userType]}</div>
            <h3 className="text-xl font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors">{userType}</h3>
        </div>
    );
};

const UserTypeSelector: React.FC<UserTypeSelectorProps> = ({ onSelectUserType }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4 bg-[radial-gradient(circle_at_center,_#1e293b,_#0f172a)]">
        <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
                <Logo className="h-16 w-16 text-indigo-400" />
            </div>
            <h1 className="text-4xl font-bold text-slate-100 mb-2">Tell us about yourself</h1>
            <p className="text-lg text-slate-400">This helps us tailor the experience just for you.</p>
        </div>
      
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {userTypes.map((type) => (
            <UserTypeCard key={type} userType={type} onClick={() => onSelectUserType(type)} />
            ))}
        </div>
    </div>
  );
};

export default UserTypeSelector;
