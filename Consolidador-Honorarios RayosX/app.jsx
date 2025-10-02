import React, { useState, useMemo } from 'react';
import { Upload, FileSpreadsheet, DollarSign, AlertCircle, Download, Search, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ConsolidadorHonorarios() {
  const [archivos, setArchivos] = useState([]);
  const [datos, setDatos] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [medicoSeleccionado, setMedicoSeleccionado] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const institucionesExcluidas = [
    'SINDICATO UNICO DE SERVIDORES PUBLICOS DEL GOBIERNO DEL ESTADO DE NUEVO LEON',
    'INSTITUTO DE SEGURIDAD Y SERVICIOS SOCIALES DE LOS TRABAJADORES DEL ESTADO DE NUEVO LEON'
  ];

  const procesarArchivos = async (files) => {
    setCargando(true);
    const todosLosDatos = [];

    for (const file of files) {
      try {
        const data = await leerArchivoExcel(file);
        todosLosDatos.push(...data);
      } catch (error) {
        console.error(`Error procesando ${file.name}:`, error);
      }
    }

    setDatos(todosLosDatos);
    generarResumen(todosLosDatos);
    setCargando(false);
  };

  const leerArchivoExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const obtenerMes = (fecha) => {
    if (!fecha) return 'Sin fecha';
    try {
      let fechaObj;
      if (typeof fecha === 'number') {
        // Excel serial date
        const excelEpoch = new Date(1899, 11, 30);
        fechaObj = new Date(excelEpoch.getTime() + fecha * 86400000);
      } else {
        fechaObj = new Date(fecha);
      }
      
      if (isNaN(fechaObj.getTime())) return 'Fecha inválida';
      
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return `${meses[fechaObj.getMonth()]} ${fechaObj.getFullYear()}`;
    } catch (error) {
      return 'Error en fecha';
    }
  };

  const generarResumen = (datos) => {
    const resumenPorMedico = {};

    datos.forEach(registro => {
      const doctor = registro.Doctor || '';
      const institucion = registro.Institucion || '';
      const honorarios = parseFloat(registro.Honorarios) || 0;
      const tipoCargo = registro.TipoCargo || '';
      const descripcion = registro.Descripcion || '';
      const fecha = registro.Fechainterpreta || registro.fechainterpreta || '';

      if (!doctor) return;

      if (!resumenPorMedico[doctor]) {
        resumenPorMedico[doctor] = {
          doctor: doctor,
          totalPagado: 0,
          totalNoPagado: 0,
          totalGeneral: 0,
          registrosPagados: 0,
          registrosNoPagados: 0,
          detalles: [],
          detallesNoPagados: []
        };
      }

      const esInstitucionExcluida = institucionesExcluidas.some(inst => 
        institucion.toUpperCase().includes(inst.toUpperCase())
      );

      const mes = obtenerMes(fecha);

      if (esInstitucionExcluida) {
        resumenPorMedico[doctor].totalNoPagado += honorarios;
        resumenPorMedico[doctor].registrosNoPagados++;
        resumenPorMedico[doctor].detallesNoPagados.push({
          descripcion,
          tipoCargo,
          institucion,
          honorarios,
          fecha: mes
        });
      } else {
        resumenPorMedico[doctor].totalPagado += honorarios;
        resumenPorMedico[doctor].registrosPagados++;
      }

      resumenPorMedico[doctor].totalGeneral += honorarios;
      resumenPorMedico[doctor].detalles.push({
        descripcion,
        tipoCargo,
        institucion,
        honorarios,
        esPagado: !esInstitucionExcluida,
        fecha: mes
      });
    });

    const resumenArray = Object.values(resumenPorMedico).sort((a, b) => 
      b.totalGeneral - a.totalGeneral
    );

    setResumen(resumenArray);
    
    // Auto-seleccionar a la Dra. Gladys si está en los datos
    const gladys = resumenArray.find(r => 
      r.doctor.toUpperCase().includes('DE HOYOS FERNANDEZ GLADYS')
    );
    if (gladys) {
      setMedicoSeleccionado(gladys.doctor);
      setBusqueda('GLADYS');
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setArchivos(files);
    if (files.length > 0) {
      procesarArchivos(files);
    }
  };

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(valor);
  };

  const medicosFiltrados = useMemo(() => {
    if (!busqueda) return resumen;
    return resumen.filter(m => 
      m.doctor.toUpperCase().includes(busqueda.toUpperCase())
    );
  }, [resumen, busqueda]);

  const exportarDetalles = () => {
    const medico = resumen.find(r => r.doctor === medicoSeleccionado);
    if (!medico) return;

    const ws1 = XLSX.utils.json_to_sheet(medico.detalles.map(d => ({
      'Descripción': d.descripcion,
      'Tipo de Cargo': d.tipoCargo,
      'Institución': d.institucion,
      'Mes': d.fecha,
      'Honorarios': d.honorarios,
      'Estado': d.esPagado ? 'PAGADO' : 'NO PAGADO'
    })));

    const ws2 = XLSX.utils.json_to_sheet(medico.detallesNoPagados.map(d => ({
      'Descripción': d.descripcion,
      'Tipo de Cargo': d.tipoCargo,
      'Institución': d.institucion,
      'Mes': d.fecha,
      'Honorarios': d.honorarios
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws1, 'Todos los Registros');
    XLSX.utils.book_append_sheet(workbook, ws2, 'ISSSTE y SUSPE');
    XLSX.writeFile(workbook, `Honorarios_${medicoSeleccionado.replace(/\s/g, '_')}.xlsx`);
  };

  const medicoDetalle = resumen.find(r => r.doctor === medicoSeleccionado);

  const registrosNoPagadosPorMes = useMemo(() => {
    if (!medicoDetalle) return {};
    const agrupado = {};
    medicoDetalle.detallesNoPagados.forEach(d => {
      if (!agrupado[d.fecha]) {
        agrupado[d.fecha] = [];
      }
      agrupado[d.fecha].push(d);
    });
    return agrupado;
  }, [medicoDetalle]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Consolidador de Honorarios Médicos
            </h1>
          </div>

          <div className="mb-6">
            <label className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-dashed border-gray-300 rounded-lg appearance-none cursor-pointer hover:border-indigo-400 focus:outline-none">
              <div className="flex flex-col items-center space-y-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="text-sm text-gray-500">
                  {archivos.length > 0 
                    ? `${archivos.length} archivo(s) seleccionado(s)` 
                    : 'Arrastra archivos Excel aquí o haz clic para seleccionar'}
                </span>
              </div>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".xlsx,.xls"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {cargando && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-gray-600">Procesando archivos...</p>
            </div>
          )}

          {resumen.length > 0 && (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-1">Instituciones sin pago de honorarios:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {institucionesExcluidas.map((inst, i) => (
                        <li key={i}>{inst}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar médico por nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>

        {resumen.length > 0 && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-green-600" />
                Resumen por Médico {medicosFiltrados.length !== resumen.length && `(${medicosFiltrados.length} resultados)`}
              </h2>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {medicosFiltrados.map((medico, idx) => (
                  <div
                    key={idx}
                    onClick={() => setMedicoSeleccionado(medico.doctor)}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${
                      medicoSeleccionado === medico.doctor
                        ? 'bg-indigo-50 border-2 border-indigo-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <p className="font-semibold text-gray-800 mb-2">{medico.doctor}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-600">Pagado:</p>
                        <p className="font-bold text-green-600">
                          {formatearMoneda(medico.totalPagado)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {medico.registrosPagados} registros
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">No Pagado:</p>
                        <p className="font-bold text-orange-600">
                          {formatearMoneda(medico.totalNoPagado)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {medico.registrosNoPagados} registros
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600">Total General:</p>
                      <p className="font-bold text-indigo-600">
                        {formatearMoneda(medico.totalGeneral)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {medicoDetalle && (
              <>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold text-gray-800">
                      Resumen General
                    </h2>
                    <button
                      onClick={exportarDetalles}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Exportar Todo
                    </button>
                  </div>
                  
                  <p className="text-lg font-semibold text-gray-700 mb-4">
                    {medicoDetalle.doctor}
                  </p>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Pagado</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatearMoneda(medicoDetalle.totalPagado)}
                      </p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">No Pagado (ISSSTE/SUSPE)</p>
                      <p className="text-xl font-bold text-orange-600">
                        {formatearMoneda(medicoDetalle.totalNoPagado)}
                      </p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total General</p>
                      <p className="text-xl font-bold text-indigo-600">
                        {formatearMoneda(medicoDetalle.totalGeneral)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar className="w-6 h-6 text-orange-600" />
                    Registros ISSSTE y SUSPE por Mes
                  </h2>

                  {Object.keys(registrosNoPagadosPorMes).length === 0 ? (
                    <p className="text-gray-500 text-center py-4">
                      No hay registros de ISSSTE o SUSPE para este médico
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(registrosNoPagadosPorMes).sort().map(([mes, registros]) => {
                        const totalMes = registros.reduce((sum, r) => sum + r.honorarios, 0);
                        return (
                          <div key={mes} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-orange-100 px-4 py-3 flex justify-between items-center">
                              <h3 className="font-semibold text-gray-800">{mes}</h3>
                              <span className="font-bold text-orange-600">
                                {formatearMoneda(totalMes)}
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Descripción</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tipo Cargo</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Institución</th>
                                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Honorarios</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {registros.map((registro, idx) => (
                                    <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                                      <td className="px-4 py-3 text-sm text-gray-800">{registro.descripcion}</td>
                                      <td className="px-4 py-3 text-sm text-gray-600">{registro.tipoCargo}</td>
                                      <td className="px-4 py-3 text-sm text-gray-500 text-xs">
                                        {registro.institucion.length > 40 
                                          ? registro.institucion.substring(0, 40) + '...' 
                                          : registro.institucion}
                                      </td>
                                      <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">
                                        {formatearMoneda(registro.honorarios)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
