import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import { Upload, Download, Filter, Calendar, ChevronDown, ChevronUp, X } from 'lucide-react';

const ROLE_WEIGHTS = {
  'Lead': 1,
  'Co-Lead': 0.7,
  'Strategic Advisor': 0.3,
  'Supporting': 0.2
};

const MAX_RECOMMENDED_LOAD = 8;

const ConsultantCapacityDashboard = () => {
  const [consultantData, setConsultantData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [expandedConsultant, setExpandedConsultant] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    businessLine: 'all',
    timeframe: 'all',
    capacityStatus: 'all',
    consultantSearch: ''
  });
  
  // Available filter options
  const [filterOptions, setFilterOptions] = useState({
    businessLines: [],
    timeframes: ['all', '3months', '6months', '12months'],
    capacityStatuses: ['all', 'available', 'at-capacity', 'over-capacity']
  });

  useEffect(() => {
    applyFilters();
  }, [filters, consultantData]);

  const applyFilters = () => {
    let filtered = [...consultantData];

    // Business Line filter
    if (filters.businessLine !== 'all') {
      filtered = filtered.map(consultant => ({
        ...consultant,
        projects: consultant.projects.filter(project => 
          project.businessLine === filters.businessLine
        )
      }));
    }

    // Timeframe filter
    if (filters.timeframe !== 'all') {
      const months = parseInt(filters.timeframe);
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() + months);
      
      filtered = filtered.map(consultant => ({
        ...consultant,
        projects: consultant.projects.filter(project => {
          const endDate = new Date(project.endDate);
          return endDate <= cutoffDate;
        })
      }));
    }

    // Capacity Status filter
    if (filters.capacityStatus !== 'all') {
      filtered = filtered.filter(consultant => {
        const currentLoad = consultant.timeline[0].weightedLoad;
        switch (filters.capacityStatus) {
          case 'available':
            return currentLoad < MAX_RECOMMENDED_LOAD * 0.8;
          case 'at-capacity':
            return currentLoad >= MAX_RECOMMENDED_LOAD * 0.8 && currentLoad <= MAX_RECOMMENDED_LOAD;
          case 'over-capacity':
            return currentLoad > MAX_RECOMMENDED_LOAD;
          default:
            return true;
        }
      });
    }

    // Consultant Search
    if (filters.consultantSearch) {
      filtered = filtered.filter(consultant =>
        consultant.name.toLowerCase().includes(filters.consultantSearch.toLowerCase())
      );
    }

    setFilteredData(filtered);
  };

  const exportData = (format) => {
    const exportTimestamp = new Date().toISOString().split('T')[0];
    
    switch (format) {
      case 'csv':
        const csvData = filteredData.flatMap(consultant => 
          consultant.projects.map(project => ({
            Consultant: consultant.name,
            Project: project.projectName,
            Role: project.role,
            'Business Line': project.businessLine,
            'Start Date': project.startDate,
            'End Date': project.endDate,
            'Current Load': consultant.timeline[0].weightedLoad,
            'Available Capacity': MAX_RECOMMENDED_LOAD - consultant.timeline[0].weightedLoad
          }))
        );

        const csv = Papa.unparse(csvData);
        downloadFile(csv, `capacity-report-${exportTimestamp}.csv`, 'text/csv');
        break;

      case 'json':
        const jsonData = JSON.stringify(filteredData, null, 2);
        downloadFile(jsonData, `capacity-report-${exportTimestamp}.json`, 'application/json');
        break;

      case 'excel':
        // Generate Excel-compatible CSV
        const excelData = Papa.unparse(filteredData.flatMap(consultant => 
          consultant.timeline.map(month => ({
            Consultant: consultant.name,
            Month: month.month,
            'Project Load': month.weightedLoad,
            'Available Capacity': month.capacity,
            'Active Projects': month.details.map(p => p.name).join('; ')
          }))
        ));
        downloadFile(excelData, `capacity-report-${exportTimestamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        break;
    }
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Rest of your existing code...

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* File Upload Section */}
      <div className="mb-8 flex justify-between items-start">
        <div className="w-1/3">
          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-gray-50">
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="mt-2 text-sm text-gray-600">Upload Hubspot CSV</span>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
        </div>

        {/* Filter Section */}
        <div className="w-2/3 ml-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="grid grid-cols-2 gap-4">
              {/* Business Line Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Business Line</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={filters.businessLine}
                  onChange={(e) => setFilters({ ...filters, businessLine: e.target.value })}
                >
                  <option value="all">All Business Lines</option>
                  {filterOptions.businessLines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              {/* Timeframe Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Timeframe</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={filters.timeframe}
                  onChange={(e) => setFilters({ ...filters, timeframe: e.target.value })}
                >
                  <option value="all">All Time</option>
                  <option value="3months">Next 3 Months</option>
                  <option value="6months">Next 6 Months</option>
                  <option value="12months">Next 12 Months</option>
                </select>
              </div>

              {/* Capacity Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Capacity Status</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={filters.capacityStatus}
                  onChange={(e) => setFilters({ ...filters, capacityStatus: e.target.value })}
                >
                  <option value="all">All Statuses</option>
                  <option value="available">Available Capacity</option>
                  <option value="at-capacity">At Capacity</option>
                  <option value="over-capacity">Over Capacity</option>
                </select>
              </div>

              {/* Consultant Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Search Consultant</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Search by name..."
                  value={filters.consultantSearch}
                  onChange={(e) => setFilters({ ...filters, consultantSearch: e.target.value })}
                />
              </div>
            </div>

            {/* Export Options */}
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => exportData('csv')}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={() => exportData('excel')}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </button>
              <button
                onClick={() => exportData('json')}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {Object.entries(filters).some(([key, value]) => value !== 'all' && value !== '') && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, value]) => {
            if (value !== 'all' && value !== '') {
              return (
                <span key={key} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  {key}: {value}
                  <button
                    onClick={() => setFilters({ ...filters, [key]: key === 'consultantSearch' ? '' : 'all' })}
                    className="ml-2 hover:text-blue-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* Rest of your existing dashboard content here... */}
      
    </div>
  );
};

export default ConsultantCapacityDashboard;