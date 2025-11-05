# NOTE: This file is also included by `ext/HistorialStdlibGenerator/generate_historical_stdlibs.jl`
using Pkg

import Base: UUID

# Use the `Pkg` `StdlibInfo` type if it exists, otherwise just re-define it
if !isdefined(Pkg.Types, :StdlibInfo)
struct StdlibInfo
    name::String
    uuid::UUID

    # This can be `nothing` if it's an unregistered stdlib
    version::Union{Nothing,VersionNumber}

    deps::Vector{UUID}
    weakdeps::Vector{UUID}
end
else
import Pkg.Types: StdlibInfo
end

# Base info struct for stdlib segments (excludes version)
Base.@kwdef struct StdlibBaseInfo
    name::String
    uuid::UUID
    deps::Vector{UUID} = UUID[]
    weakdeps::Vector{UUID} = UUID[]
end

# Segment struct that combines base info with version ranges
Base.@kwdef struct StdlibSegment
    base_info::StdlibBaseInfo
    version_ranges::Vector{Pair{Tuple{VersionNumber,VersionNumber}, Union{Nothing,VersionNumber}}}
end

