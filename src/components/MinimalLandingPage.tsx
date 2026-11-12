import React from 'react';
import { LandingPage } from './LandingPage';

interface MinimalLandingPageProps {
  onEnterPlatform: () => void;
}

export const MinimalLandingPage: React.FC<MinimalLandingPageProps> = ({ onEnterPlatform }) => (
  <LandingPage onExplorePlatform={onEnterPlatform} onSignIn={onEnterPlatform} />
);