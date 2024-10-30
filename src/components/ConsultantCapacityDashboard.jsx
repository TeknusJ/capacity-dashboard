import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import { Upload, Download, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(false); // Now used in the component
  const [error, setError] = useState(null); // Now used in the component

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

  const generateMonthlyTimeline = (projects) => {
    // Generate timeline for next 12 months
    const months = [];
    const today = new Date();

    for (let i = 0; i < 12; i++) {
      const month = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push(month);
    }

    return months.map(month => {
      const activeProjects = projects.filter(project => {
        const startDate = new Date(project.startDate);
        const endDate = new Date(project.endDate);
        return (!isNaN(startDate) && !isNaN(endDate)) &&
          (month >= startDate && month <= endDate);
      });

      const weightedLoad = activeProjects.reduce((total, project) =>
        total + (ROLE_WEIGHTS[project.role] || 0), 0);

      return {
        month: month.toLocaleString('default', { month: 'short', year: '2-digit' }),
        projects: activeProjects.length,
        weightedLoad: parseFloat(weightedLoad.toFixed(1)),
        capacity: Math.max(0, MAX_RECOMMENDED_LOAD - weightedLoad),
        details: activeProjects.map(p => ({
          name: p.projectName,
          role: p.role,
          businessLine: p.businessLine
        }))
      };
    });
  };

  const processData = (parsedData) => {
    try {
      const splitConsultants = (str) => str ? str.split(';').map(s => s.trim()).filter(Boolean) : [];

      // Process consultant projects
      const projectsByConsultant = {};
      parsedData.data.forEach(project => {
        const processRole = (names, role) => {
          splitConsultants(names).forEach(name => {
            if (!projectsByConsultant[name]) {
              projectsByConsultant[name] = [];
            }
            projectsByConsultant[name].push({
              projectName: project['Deal Name'],
              role: role,
              startDate: project['Contract Start Date'],
              endDate: project['Contract End Date'],
              businessLine: project['Primary Business Line']
            });
          });
        };

        processRole(project['Project Lead'], 'Lead');
        processRole(project['Project Co-Lead'], 'Co-Lead');
        processRole(project['Project Strategic Advisors'], 'Strategic Advisor');
        processRole(project['Project Supporting Consultants'], 'Supporting');
      });

      // Generate timeline data for each consultant
      const consultantsWithTimeline = Object.entries(projectsByConsultant)
        .map(([name, projects]) => ({
          name,
          projects: _.uniqBy(projects, 'projectName'),
          timeline: generateMonthlyTimeline(projects),
          currentLoad: projects.filter(p => {
            const now = new Date();
            const startDate = new Date(p.startDate);
            const endDate = new Date(p.endDate);
            return (!isNaN(startDate) && !isNaN(endDate)) &&
              (now >= startDate && now <= endDate);
          }).length
        }))
        .sort((a, b) => b.currentLoad - a.currentLoad);

      setConsultantData(consultantsWithTimeline);
      setFilteredData(consultantsWithTimeline);

      // Update business line options
      const businessLines = _.uniq(
        parsedData.data
          .map(project => project['Primary Business Line'])
          .filter(Boolean)
      );
      setFilterOptions(prev => ({
        ...prev,
        businessLines
      }));
    } catch (err) {
      setError('Error processing data: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event) => {
    setIsLoading(true);
    setError(null);
    const file = event.target.files[0];

    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results);
          setIsLoading(false);
        },
        error: (error) => {
          setError('Error parsing CSV: ' + error.message);
          setIsLoading(false);
        }
      });
    } else {
      setIsLoading(false);
    }
  };

  const toggleConsultant = (consultantName) => {
    setExpandedConsultant(expandedConsultant === consultantName ? null : consultantName);
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

      case 'excel':
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

      case 'json':
        const jsonData = JSON.stringify(filteredData, null, 2);
        downloadFile(jsonData, `capacity-report-${exportTimestamp}.json`, 'application/json');
        break;

      default:
        console.warn(`Unsupported export format: ${format}`);
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

  useEffect(() => {
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

    applyFilters();
  }, [filters, consultantData]);

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

      {/* Display error if any */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Display loading indicator */}
      {isLoading && (
        <div className="mb-4 p-4 bg-blue-100 text-blue-700 rounded">
          Loading data, please wait...
        </div>
      )}

      {consultantData.length > 0 && (
        <div className="space-y-6">
          {filteredData.map((consultant) => (
            <div key={consultant.name} className="bg-white rounded-lg shadow">
              <button
                onClick={() => toggleConsultant(consultant.name)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-lg font-semibold">{consultant.name}</span>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    consultant.currentLoad >= MAX_RECOMMENDED_LOAD
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {consultant.currentLoad} Active Projects
                  </span>
                </div>
                {expandedConsultant === consultant.name ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {expandedConsultant === consultant.name && (
                <div className="px-6 pb-6">
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-500 mb-2">12-Month Capacity Timeline</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={consultant.timeline}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-4 shadow rounded border">
                                    <p className="font-semibold">{label}</p>
                                    <p className="text-sm">Weighted Load: {data.weightedLoad}</p>
                                    <p className="text-sm text-green-600">Available Capacity: {data.capacity}</p>
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold">Active Projects:</p>
                                      {data.details.map((project, idx) => (
                                        <p key={idx} className="text-xs">
                                          {project.name} ({project.role})
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="weightedLoad" fill="#8884d8" name="Project Load" />
                          <Bar dataKey="capacity" fill="#82ca9d" name="Available Capacity" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Current Projects</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Line</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timeline</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {consultant.projects.map((project, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">{project.projectName}</td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  project.role === 'Lead' ? 'bg-green-100 text-green-800' :
                                  project.role === 'Co-Lead' ? 'bg-blue-100 text-blue-800' :
                                  project.role === 'Strategic Advisor' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {project.role}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">{project.businessLine}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {project.startDate} - {project.endDate}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConsultantCapacityDashboard;
