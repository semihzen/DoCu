import React, { useState, useEffect } from 'react';
import { Search, FolderOpen, FileText, Download, Edit, ChevronDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Docu.css';

const DocuWebsite = () => {
  const [selectedFolder, setSelectedFolder] = useState('Raporlar');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const folders = ['Raporlar', 'Şablonlar', 'Arşiv', 'Taslaklar'];

  const userEmail = localStorage.getItem("email") || "Kullanıcı";

  // Çıkış işlemi
  const handleLogout = () => {
    localStorage.clear(); // Tüm token ve bilgileri sil
    navigate('/Login');
  };

  // Veritabanından dokümanları çek
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      // Buraya veritabanı API çağrınız gelecek
      setDocuments([]);
    } catch (error) {
      console.error('Dokümanlar yüklenirken hata:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFileIcon = () => {
    return <FileText className="file-icon" />;
  };

  const handleUpload = () => {
    if (title && description) {
      alert(`Doküman yüklendi: ${title}`);
      setTitle('');
      setDescription('');
    } else {
      alert('Lütfen başlık ve açıklama girin');
    }
  };

  return (
    <div className="docu-container">
      {/* Navbar */}
      <div className="navbar">
        <h1 className="header-title">Welcome DoCu!</h1>
        <div className="navbar-right">
          <span className="user-email">{userEmail}</span>
          <button className="logout-button" onClick={handleLogout}>
            <LogOut size={18} /> Çıkış
          </button>
        </div>
      </div>

      <div className="main-content">
        {/* Left Panel */}
        <div className="left-panel">
          <h2 className="panel-title">Add DoCument</h2>

          {/* Folder Selection */}
          <div className="form-group">
            <label className="form-label">Folders</label>
            <div className="select-wrapper">
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="form-select"
              >
                {folders.map(folder => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
              </select>
              <ChevronDown className="select-icon" />
            </div>
          </div>

          {/* Title Input */}
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input"
              placeholder="Set Document Title"
            />
          </div>

          {/* Description Input */}
          <div className="form-group">
            <label className="form-label">Upload DoCument</label>
            <label htmlFor="file-upload" className="custom-file-upload">
              <img
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="Logo"
                style={{ width: '20px', height: '20px', marginRight: '8px', verticalAlign: 'middle' }}
              />
              Choose DoCument
            </label>
            <input
              id="file-upload"
              type="file"
              onChange={(e) => console.log(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </div>


          {/* Upload Button */}
          <button onClick={handleUpload} className="upload-button">
            Upload
          </button>
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          {/* Search Bar */}
          <div className="search-container">
            <div className="search-wrapper">
              <Search className="search-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Documents"
                className="search-input"
              />
            </div>
          </div>

          {/* Documents Section */}
          <div className="documents-container">
            {/* Folder Header */}
            <div className="folder-header">
              <FolderOpen className="folder-icon" />
              <h3 className="folder-title">DoCuments</h3>
            </div>

            {/* Document List */}
            <div className="documents-list">
              {loading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <p className="loading-text">DoCuments Loading</p>
                </div>
              ) : filteredDocuments.length > 0 ? (
                filteredDocuments.map((doc) => (
                  <div key={doc.id} className="document-item">
                    <div className="document-info">
                      {getFileIcon(doc.type)}
                      <div className="document-details">
                        <h4 className="document-name">{doc.name}</h4>
                        <p className="document-description">{doc.description}</p>
                      </div>
                    </div>

                    <div className="document-actions">
                      <button className="action-button download-button">
                        <Download className="action-icon" />
                        Download
                      </button>

                      {doc.canEdit && (
                        <button className="action-button edit-button">
                          <Edit className="action-icon" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <FileText className="empty-icon" />
                  <p className="empty-text">
                    {searchTerm
                      ? "Arama kriterlerinize uygun doküman bulunamadı."
                      : "Henüz doküman bulunmuyor."
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocuWebsite;
