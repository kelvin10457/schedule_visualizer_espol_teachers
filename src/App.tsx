import { Routes, Route } from 'react-router-dom';

import UplaodFile from './pages/UploadFile';
import Schedule from './pages/Schedule';

export default function App() {

  return (
    <>
      <Routes>
        <Route path="/" element={<UplaodFile />} />
        <Route path="/show-schedule" element={<Schedule />} />
      </Routes>

    </>
  );
}