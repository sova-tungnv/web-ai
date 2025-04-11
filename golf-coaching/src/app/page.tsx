// app/page.tsx
"use client";

import { useState } from 'react';
import PostureAnalyzer from './components/PostureAnalyzer';

type ClubType = "driver" | "iron" | "wedge" | "putter" | "hybrid" | "fairway";

const Home: React.FC = () => {
  const [clubType, setClubType] = useState<ClubType>('driver');
  const clubTypes: ClubType[] = [
    "driver",
    "iron",
    "wedge",
    "putter",
    "hybrid",
    "fairway",
  ];

  return (
    <div className="container">
      <div className="sidebar">
        <h3>Club Types</h3>
        <ul>
          {clubTypes.map((club) => (
            <li key={club}>
              <a
                onClick={() => setClubType(club)}
                style={{
                  cursor: "pointer",
                  fontWeight: clubType === club ? "bold" : "normal",
                  color: clubType === club ? "#0070f3" : "#333",
                  textTransform: "capitalize",
                  display: "block",
                  padding: "10px",
                }}
              >
                {club}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="main-content">
        <PostureAnalyzer clubType={clubType} />
      </div>
    </div>
  );
};

export default Home;