import HistoricalStdlibVersions
import Pkg
using Test

@test !isempty(Pkg.Types.STDLIBS_BY_VERSION)
