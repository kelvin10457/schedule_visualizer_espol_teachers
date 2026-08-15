import { Routes, Route } from 'react-router-dom';

import UplaodFile from './pages/UploadFile';
import Schedule from './pages/Schedule';
import Config from './pages/Config';
import Conflicts from './pages/Conflicts';

export default function App() {

  return (
    <>
      <Routes>
        <Route path="/" element={<UplaodFile />} />
        <Route path="/show-schedule" element={<Schedule />} />
        <Route path="/config" element={<Config />} />
        <Route path="/conflicts" element={<Conflicts />} />
      </Routes>

    </>
  );
}